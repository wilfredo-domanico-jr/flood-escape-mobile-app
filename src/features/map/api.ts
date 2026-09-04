import { NEARBY_RADIUS_M, VIEWPORT_REPORT_LIMIT } from "@/constants/thresholds";
import type { Bbox } from "@/lib/geo/bbox";
import { supabase } from "@/lib/supabase/client";
import type { NearbyReport, PublicReport } from "@/lib/supabase/database.types";

export async function fetchReportsInBbox(bbox: Bbox, includeStale = true): Promise<PublicReport[]> {
  const { data, error } = await supabase.rpc("reports_in_bbox", {
    p_min_lat: bbox.minLat,
    p_min_lng: bbox.minLng,
    p_max_lat: bbox.maxLat,
    p_max_lng: bbox.maxLng,
    p_include_stale: includeStale,
    p_limit: VIEWPORT_REPORT_LIMIT,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchReportsNear(lat: number, lng: number, radiusM = NEARBY_RADIUS_M): Promise<NearbyReport[]> {
  const { data, error } = await supabase.rpc("reports_near", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_limit: 100,
  });
  if (error) throw error;
  return data ?? [];
}
