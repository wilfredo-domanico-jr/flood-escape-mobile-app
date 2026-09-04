import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { MAX_VIEWPORT_SPAN_DEG } from "@/constants/thresholds";
import { overlayLifecycle } from "@/lib/confidence/lifecycle";
import { type Bbox, bboxKey, clampBbox, expandBbox, snapBbox } from "@/lib/geo/bbox";
import type { PublicReport } from "@/lib/supabase/database.types";

import { fetchReportsInBbox } from "./api";

/** Stable, slightly enlarged, snapped bbox so small pans hit the cache instead of the network. */
export function normalizeViewport(viewport: Bbox | null): Bbox | null {
  if (!viewport) return null;
  return snapBbox(expandBbox(clampBbox(viewport, MAX_VIEWPORT_SPAN_DEG), 1.3), 0.01);
}

export const reportsQueryKey = (bbox: Bbox | null) =>
  ["reports", "bbox", bbox ? bboxKey(bbox) : "none"] as const;

export function useReportsInViewport(viewport: Bbox | null, enabled = true) {
  const bbox = useMemo(() => normalizeViewport(viewport), [viewport]);
  const query = useQuery({
    queryKey: reportsQueryKey(bbox),
    queryFn: () => fetchReportsInBbox(bbox as Bbox),
    enabled: enabled && bbox !== null,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  // Cached rows may have aged while offline; show them as stale rather than fresh.
  const reports = useMemo(() => {
    const rows = overlayLifecycle((query.data ?? []) as PublicReport[]);
    return rows.filter((r) => r.effective_status !== "resolved");
  }, [query.data]);

  return { ...query, bbox, reports };
}
