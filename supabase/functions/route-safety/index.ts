// Route safety Edge Function.
// Holds the routing provider key (openrouteservice) so it never ships in the app, geocodes the
// destination, fetches a driving route, and asks Postgres which flood reports lie along it.
// The provider is isolated behind two small functions so it can be swapped without touching the app.
import { createClient } from "npm:@supabase/supabase-js@2";

type LatLng = { lat: number; lng: number };
type Body = {
  origin: LatLng;
  destination: { text?: string; lat?: number; lng?: number };
};

const ORS_BASE = "https://api.openrouteservice.org";
const RATE_LIMIT_PER_HOUR = 10;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_ROUTE_POINTS = 500;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function isLatLng(v: unknown): v is LatLng {
  const o = v as LatLng;
  return o && Number.isFinite(o.lat) && Number.isFinite(o.lng) && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;
}

/** Keeps every Nth point so long routes stay under the RPC's 2000-point limit and PostGIS stays fast. */
function decimate(coords: number[][], max: number): number[][] {
  if (coords.length <= max) return coords;
  const step = Math.ceil(coords.length / max);
  const out = coords.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

// ---- Provider: openrouteservice ------------------------------------------------------------

/**
 * Resolves a place name to coordinates. Autocomplete with a focus point ranks nearby venues
 * first ("SM Marikina" resolves to the mall in Marikina, not a same-brand mall 50 km away);
 * plain search is the fallback for full addresses the autocomplete index does not carry.
 */
async function geocode(apiKey: string, text: string, focus: LatLng): Promise<{ lat: number; lng: number; label: string } | null> {
  for (const endpoint of ["autocomplete", "search"]) {
    const url = new URL(`${ORS_BASE}/geocode/${endpoint}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", text);
    url.searchParams.set("size", "1");
    url.searchParams.set("boundary.country", "PH");
    url.searchParams.set("focus.point.lat", String(focus.lat));
    url.searchParams.set("focus.point.lon", String(focus.lng));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`geocode_failed:${res.status}`);
    const data = await res.json();
    const f = data.features?.[0];
    if (f) return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties?.label ?? text };
  }
  return null;
}

async function directions(apiKey: string, from: LatLng, to: LatLng) {
  const res = await fetch(`${ORS_BASE}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
  });
  if (res.status === 404 || res.status === 400) throw new Error("no_route");
  if (!res.ok) throw new Error(`directions_failed:${res.status}`);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) throw new Error("no_route");
  return {
    coordinates: decimate(feature.geometry.coordinates as number[][], MAX_ROUTE_POINTS),
    distance_m: feature.properties?.summary?.distance ?? null,
    duration_s: feature.properties?.summary?.duration ?? null,
  };
}

// ---- Handler ------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const orsKey = Deno.env.get("ORS_API_KEY");

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  if (!isLatLng(body.origin)) return json(400, { error: "invalid_origin" });
  const dest = body.destination ?? {};
  const destText = typeof dest.text === "string" ? dest.text.trim().slice(0, 120) : "";
  const destCoords = isLatLng(dest) ? { lat: dest.lat as number, lng: dest.lng as number } : null;
  if (!destText && !destCoords) return json(400, { error: "invalid_destination" });

  if (!orsKey) return json(503, { error: "routing_unconfigured" });

  const admin = createClient(supabaseUrl, serviceKey);

  // Per-user rate limit.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("route_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return json(429, { error: "rate_limited" });
  await admin.from("route_requests").insert({ user_id: userId });

  try {
    // Resolve the destination.
    let destination: { lat: number; lng: number; label: string };
    if (destCoords) destination = { ...destCoords, label: destText || "Destination" };
    else {
      const g = await geocode(orsKey, destText, body.origin);
      if (!g) return json(404, { error: "destination_not_found" });
      destination = g;
    }

    // Route geometry is cacheable (roads do not change in 10 minutes); the risk check is not.
    const r3 = (v: number) => v.toFixed(3);
    const cacheKey = `${r3(body.origin.lat)},${r3(body.origin.lng)}>${r3(destination.lat)},${r3(destination.lng)}`;
    let route: { coordinates: number[][]; distance_m: number | null; duration_s: number | null } | null = null;
    const { data: cached } = await admin.from("route_cache").select("response, created_at").eq("cache_key", cacheKey).maybeSingle();
    if (cached && Date.now() - Date.parse(cached.created_at) < CACHE_TTL_MS) {
      route = cached.response as typeof route;
    }
    if (!route) {
      route = await directions(orsKey, body.origin, destination);
      await admin.from("route_cache").upsert({ cache_key: cacheKey, response: route, created_at: new Date().toISOString() });
    }

    const geometry = { type: "LineString", coordinates: route.coordinates };
    const { data: hits, error: hitsError } = await userClient.rpc("reports_along_route", {
      p_route_geojson: JSON.stringify(geometry),
      p_buffer_m: 300,
    });
    if (hitsError) return json(500, { error: "risk_check_failed", detail: hitsError.message });

    return json(200, {
      route: { geometry, distance_m: route.distance_m, duration_s: route.duration_s, destination },
      hits: hits ?? [],
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "no_route") return json(404, { error: "no_route" });
    if (msg.startsWith("geocode_failed:4") || msg.startsWith("directions_failed:4")) return json(400, { error: "invalid_destination" });
    return json(502, { error: "routing_unavailable", detail: msg });
  }
});
