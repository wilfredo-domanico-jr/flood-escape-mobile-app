import { supabaseTransport } from "@/features/reports/api";
import { queryClient } from "@/lib/query/queryClient";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";

import { drainOutbox, type DrainResult } from "./drainOutbox";
import { sqliteOutbox } from "./outbox";

let inflight: Promise<DrainResult> | null = null;

/** Recomputes the banner state from what is left in the queue. */
export async function refreshSyncStatus(): Promise<void> {
  const rows = await sqliteOutbox.listAll();
  const pending = rows.filter((r) => r.status !== "failed").length;
  const failed = rows.some((r) => r.status === "failed");
  useAppStore.getState().setSync(failed ? "failed" : pending > 0 ? "pending" : "idle", pending);
}

/**
 * Sends whatever is due. Single-flight: concurrent callers share one run so a report is never
 * in flight twice. Safe to call from anywhere (submit, foreground, reconnect, retry).
 */
export function syncOutbox(): Promise<DrainResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const empty: DrainResult = { sent: 0, deferred: 0, failed: 0 };
    if (!isSupabaseConfigured || !useAppStore.getState().isOnline) {
      await refreshSyncStatus();
      return empty;
    }
    useAppStore.getState().setSync("syncing", useAppStore.getState().pendingCount);
    try {
      const result = await drainOutbox(sqliteOutbox, supabaseTransport);
      if (result.sent > 0) {
        await queryClient.invalidateQueries({ queryKey: ["reports"] });
        await queryClient.invalidateQueries({ queryKey: ["me"] });
      }
      return result;
    } finally {
      await refreshSyncStatus();
      inflight = null;
    }
  })();
  return inflight;
}
