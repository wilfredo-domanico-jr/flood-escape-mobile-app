import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useCallback, useState } from "react";

import { sqliteOutbox, type VerificationPayload } from "@/features/offline/outbox";
import { syncOutbox } from "@/features/offline/syncOutbox";
import { reportQueryKey } from "@/features/reports/useReport";
import { useAppStore } from "@/store/useAppStore";

export type VerifyOutcome = "sent" | "queued" | "failed";

/**
 * Votes go through the outbox like reports, so a tap in a dead zone still counts later.
 * When online the drain runs immediately and the details query is refreshed.
 */
export function useVerify(reportId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"confirm" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const vote = useCallback(
    async (kind: "confirm" | "clear", location: { lat: number; lng: number } | null): Promise<VerifyOutcome> => {
      setBusy(kind);
      setMessage(null);
      const payload: VerificationPayload = { reportId, kind, lat: location?.lat ?? null, lng: location?.lng ?? null };
      try {
        await sqliteOutbox.insert({
          clientId: Crypto.randomUUID(),
          kind: "verification",
          payload: JSON.stringify(payload),
          photoUri: null,
          reportId,
          status: "pending",
          attempts: 0,
          nextAttemptAt: 0,
          lastError: null,
          createdAt: Date.now(),
        });
        if (!useAppStore.getState().isOnline) {
          setMessage("Saved. We'll send your answer when you're back online.");
          return "queued";
        }
        const result = await syncOutbox();
        await queryClient.invalidateQueries({ queryKey: reportQueryKey(reportId) });
        if (result.failed > 0) {
          const rows = await sqliteOutbox.listAll();
          const mine = rows.find((r) => r.kind === "verification" && r.reportId === reportId && r.status === "failed");
          setMessage(mine?.lastError ?? "Couldn't send your answer.");
          if (mine) await sqliteOutbox.remove(mine.clientId);
          return "failed";
        }
        setMessage(kind === "confirm" ? "Thanks. Others will see it is still flooded." : "Thanks. Others will see it may have cleared.");
        return "sent";
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Couldn't save your answer.");
        return "failed";
      } finally {
        setBusy(null);
      }
    },
    [reportId, queryClient],
  );

  return { vote, busy, message };
}
