import { supabaseTransport } from "@/features/reports/api";
import { queryClient } from "@/lib/query/queryClient";
import { singleFlight } from "@/lib/async/singleFlight";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";
import { usePrefsStore } from "@/store/usePrefsStore";

import { drainOutbox, type DrainResult } from "./drainOutbox";
import { sqliteOutbox } from "./outbox";

/** Recomputes the banner state from what is left in the queue. */
export async function refreshSyncStatus(): Promise<void> {
  const rows = await sqliteOutbox.listAll();
  const pending = rows.filter((r) => r.status !== "failed").length;
  const failed = rows.some((r) => r.status === "failed");
  useAppStore.getState().setSync(failed ? "failed" : pending > 0 ? "pending" : "idle", pending);
}

const EMPTY: DrainResult = { sent: 0, deferred: 0, failed: 0 };

/**
 * Sends whatever is due. Single-flight: concurrent callers share one run so a report is never
 * in flight twice, and the slot is released on every exit path (an earlier version kept a stale
 * promise after an offline early return, which silently stopped all later syncs until restart).
 * Safe to call from anywhere (submit, foreground, reconnect, retry).
 */
export const syncOutbox: () => Promise<DrainResult> = singleFlight(async () => {
  if (!isSupabaseConfigured || !useAppStore.getState().isOnline) {
    await refreshSyncStatus();
    return EMPTY;
  }
  useAppStore.getState().setSync("syncing", useAppStore.getState().pendingCount);
  try {
    const result = await drainOutbox(sqliteOutbox, supabaseTransport, () => Date.now(), {
      canSendMedia: () => !usePrefsStore.getState().wifiOnlyPhotos || useAppStore.getState().isWifi,
    });
    if (result.sent > 0) {
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["report"] });
    }
    return result;
  } finally {
    await refreshSyncStatus();
  }
});
