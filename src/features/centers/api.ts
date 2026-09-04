import { Linking, Platform } from "react-native";

import { supabase } from "@/lib/supabase/client";

export type CenterKind = "evacuation" | "hospital" | "fire" | "police";

export type NearbyCenter = {
  id: string;
  kind: CenterKind;
  name: string;
  address: string | null;
  city: string | null;
  barangay: string | null;
  lat: number;
  lng: number;
  capacity: number | null;
  contact: string | null;
  source: string;
  source_updated_at: string | null;
  distance_m: number;
};

export async function fetchNearestCenters(lat: number, lng: number, kinds: CenterKind[] | null, limit = 20): Promise<NearbyCenter[]> {
  const { data, error } = await supabase.rpc("evacuation_centers_near", {
    p_lat: lat,
    p_lng: lng,
    p_kinds: kinds ?? undefined,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as NearbyCenter[];
}

/** Opens the platform maps app with directions to the facility. Falls back to a web URL. */
export async function openDirections(c: { lat: number; lng: number; name: string }): Promise<void> {
  const label = encodeURIComponent(c.name);
  const candidates = Platform.select({
    ios: [`maps://?daddr=${c.lat},${c.lng}&q=${label}`, `comgooglemaps://?daddr=${c.lat},${c.lng}`],
    android: [`google.navigation:q=${c.lat},${c.lng}`, `geo:${c.lat},${c.lng}?q=${c.lat},${c.lng}(${label})`],
    default: [] as string[],
  }) as string[];
  for (const url of candidates) {
    if (await Linking.canOpenURL(url).catch(() => false)) {
      await Linking.openURL(url);
      return;
    }
  }
  await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`);
}
