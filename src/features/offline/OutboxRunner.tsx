import { useEffect } from "react";
import { AppState } from "react-native";

import { useAuthStore } from "@/features/auth/authStore";
import { useAppStore } from "@/store/useAppStore";

import { refreshSyncStatus, syncOutbox } from "./syncOutbox";

const RETRY_TICK_MS = 60_000;

/**
 * Drives the outbox: on launch, when the app returns to the foreground, when connectivity
 * comes back, and on a slow tick while anything is still queued (for backoff timers).
 */
export function OutboxRunner() {
  const isOnline = useAppStore((s) => s.isOnline);
  const pendingCount = useAppStore((s) => s.pendingCount);
  const hasSession = useAuthStore((s) => Boolean(s.session));

  useEffect(() => {
    void refreshSyncStatus();
  }, []);

  useEffect(() => {
    if (!hasSession || !isOnline) return;
    void syncOutbox();
  }, [hasSession, isOnline]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncOutbox();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (pendingCount === 0 || !isOnline) return;
    const id = setInterval(() => void syncOutbox(), RETRY_TICK_MS);
    return () => clearInterval(id);
  }, [pendingCount, isOnline]);

  return null;
}
