import type { RouteHit } from "@/lib/geo/routeRisk";
import { supabase } from "@/lib/supabase/client";
import type { PublicReport } from "@/lib/supabase/database.types";

export type LatLng = { lat: number; lng: number };

export type RouteCheckResult = {
  route: {
    geometry: { type: "LineString"; coordinates: number[][] };
    distance_m: number | null;
    duration_s: number | null;
    destination: { lat: number; lng: number; label: string };
  };
  hits: (PublicReport & RouteHit)[];
  fetched_at: string;
};

export type RouteErrorCode =
  | "routing_unconfigured"
  | "routing_unavailable"
  | "destination_not_found"
  | "invalid_destination"
  | "no_route"
  | "rate_limited"
  | "unauthorized"
  | "offline"
  | "unknown";

export class RouteError extends Error {
  constructor(public code: RouteErrorCode, message?: string) {
    super(message ?? code);
  }
}

export function describeRouteError(code: RouteErrorCode): string {
  switch (code) {
    case "routing_unconfigured":
      return "Route checks aren't set up on this server yet. You can still browse reports on the map.";
    case "routing_unavailable":
      return "Route check unavailable right now. You can still browse reports on the map.";
    case "destination_not_found":
    case "invalid_destination":
      return "We couldn't find that place. Try a landmark, street or barangay name.";
    case "no_route":
      return "No driving route found between here and there.";
    case "rate_limited":
      return "Too many route checks in the last hour. Try again later.";
    case "unauthorized":
      return "You were signed out. Restart the app and try again.";
    case "offline":
      return "You're offline. Route checks need a connection.";
    default:
      return "Something went wrong checking the route.";
  }
}

export async function checkRoute(origin: LatLng, destinationText: string): Promise<RouteCheckResult> {
  const { data, error } = await supabase.functions.invoke<RouteCheckResult | { error: RouteErrorCode }>("route-safety", {
    body: { origin, destination: { text: destinationText } },
  });
  if (error) {
    // FunctionsHttpError carries the response; read the JSON error code when present.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: RouteErrorCode };
        if (body?.error) throw new RouteError(body.error);
      } catch (e) {
        if (e instanceof RouteError) throw e;
      }
    }
    if (/network|fetch/i.test(error.message)) throw new RouteError("offline");
    throw new RouteError("unknown", error.message);
  }
  if (!data || "error" in data) throw new RouteError((data as { error: RouteErrorCode })?.error ?? "unknown");
  return data;
}

export type SavedRoute = {
  id: string;
  name: string;
  origin_label: string | null;
  destination_label: string | null;
  buffer_m: number;
  notify: boolean;
  created_at: string;
  updated_at: string;
  route_geojson: { type: "LineString"; coordinates: number[][] };
};

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const { data, error } = await supabase.from("my_saved_routes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedRoute[];
}

export async function saveRoute(name: string, geometry: RouteCheckResult["route"]["geometry"], originLabel: string, destinationLabel: string) {
  const { data, error } = await supabase.rpc("save_route", {
    p_name: name,
    p_route_geojson: JSON.stringify(geometry),
    p_origin_label: originLabel,
    p_destination_label: destinationLabel,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const { error } = await supabase.from("saved_routes").delete().eq("id", id);
  if (error) throw error;
}

export async function setRouteNotify(id: string, notify: boolean): Promise<void> {
  const { error } = await supabase.from("saved_routes").update({ notify }).eq("id", id);
  if (error) throw error;
}

/** Re-assesses a saved route against current reports without calling the routing provider. */
export async function assessSavedRoute(geometry: SavedRoute["route_geojson"]): Promise<(PublicReport & RouteHit)[]> {
  const { data, error } = await supabase.rpc("reports_along_route", {
    p_route_geojson: JSON.stringify(geometry),
    p_buffer_m: 300,
  });
  if (error) throw error;
  return (data ?? []) as (PublicReport & RouteHit)[];
}
