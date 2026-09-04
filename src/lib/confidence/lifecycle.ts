import type { ReportStatus, Severity } from "@/constants/severity";

/** Mirrors `public.stale_window()`; severe floods stay relevant longer. */
export function staleWindowMs(severity: Severity): number {
  const hours = severity === "impassable" || severity === "dangerous" ? 6 : severity === "caution" ? 4 : 3;
  return hours * 60 * 60 * 1000;
}

/** How long a stale report lingers before the sweep resolves it. */
export const STALE_TO_RESOLVED_MS = 12 * 60 * 60 * 1000;

type LifecycleRow = {
  stored_status: ReportStatus;
  expires_at: string;
};

/**
 * Mirrors the `effective_status` column of the public view so cached rows never look fresher
 * than they are while the phone is offline.
 */
export function effectiveStatus(row: LifecycleRow, now: number = Date.now()): ReportStatus {
  if (row.stored_status === "resolved" || row.stored_status === "disputed") return row.stored_status;
  const expires = Date.parse(row.expires_at);
  if (!Number.isNaN(expires) && expires < now) {
    return expires < now - STALE_TO_RESOLVED_MS ? "resolved" : "stale";
  }
  return row.stored_status;
}

export function isActionable(status: ReportStatus): boolean {
  return status !== "resolved";
}
