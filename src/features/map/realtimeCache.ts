import { type Bbox, bboxContains } from "@/lib/geo/bbox";
import type { PublicReport } from "@/lib/supabase/database.types";

/** One cached viewport query: the bbox it was fetched for and its rows. */
export type CachedViewport = { bbox: Bbox; rows: PublicReport[] };

/** Rows that should be visible on the map. */
export function isVisibleOnMap(row: PublicReport): boolean {
  return row.effective_status !== "resolved";
}

/**
 * Applies a changed row to a cached viewport list. Pure: returns the same array when nothing
 * changes so React Query consumers do not re-render needlessly.
 */
export function applyRowToViewport(entry: CachedViewport, row: PublicReport): PublicReport[] {
  const inside = bboxContains(entry.bbox, { lat: row.lat, lng: row.lng });
  const index = entry.rows.findIndex((r) => r.id === row.id);
  const shouldShow = inside && isVisibleOnMap(row);

  if (!shouldShow) {
    if (index === -1) return entry.rows;
    return entry.rows.filter((r) => r.id !== row.id);
  }
  if (index === -1) return [row, ...entry.rows];
  const current = entry.rows[index];
  if (current.updated_at === row.updated_at && current.effective_status === row.effective_status) return entry.rows;
  const next = entry.rows.slice();
  next[index] = row;
  return next;
}

export function removeRowFromViewport(rows: PublicReport[], id: string): PublicReport[] {
  return rows.some((r) => r.id === id) ? rows.filter((r) => r.id !== id) : rows;
}
