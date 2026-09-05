import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAuthStore } from "@/features/auth/authStore";

import { usePushStore } from "./pushStore";

// Foreground behaviour: show route alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function reportIdFrom(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data as { report_id?: unknown } | undefined;
  return typeof data?.report_id === "string" ? data.report_id : null;
}

/**
 * Registers the push token whenever a session exists and permission was granted, keeps the
 * permission state fresh, and opens the report a tapped notification points at.
 */
export function NotificationsProvider() {
  const router = useRouter();
  const hasSession = useAuthStore((s) => Boolean(s.session));
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!hasSession) return;
    void usePushStore.getState().registerIfAllowed();
  }, [hasSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void usePushStore.getState().refreshPermission();
    });
    return () => sub.remove();
  }, []);

  // Tap while the app is running.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = reportIdFrom(response);
      const key = response.notification.request.identifier;
      if (!id || handled.current === key) return;
      handled.current = key;
      router.push({ pathname: "/report/[id]", params: { id } });
    });
    return () => sub.remove();
  }, [router]);

  // Tap that launched the app (cold start).
  useEffect(() => {
    if (!lastResponse) return;
    const id = reportIdFrom(lastResponse);
    const key = lastResponse.notification.request.identifier;
    if (!id || handled.current === key) return;
    handled.current = key;
    router.push({ pathname: "/report/[id]", params: { id } });
  }, [lastResponse, router]);

  return null;
}
