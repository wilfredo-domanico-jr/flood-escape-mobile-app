import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ROUTE_ALERTS_CHANNEL = "route-alerts";

export type PushPermission = "granted" | "denied" | "undetermined";

/** Android groups notifications by channel; the user can mute this one in system settings. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ROUTE_ALERTS_CHANNEL, {
    name: "Route alerts",
    description: "Flood reports on or near routes you saved.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0E7490",
  });
}

function toPermission(s: Notifications.NotificationPermissionsStatus): PushPermission {
  if (s.granted) return "granted";
  return s.canAskAgain ? "undetermined" : "denied";
}

export async function getPushPermission(): Promise<PushPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestPushPermission(): Promise<PushPermission> {
  return toPermission(await Notifications.requestPermissionsAsync());
}

export type PushTokenResult = { token: string; error: null } | { token: null; error: string };

/**
 * Expo push token for this install. Needs a physical device, the EAS project id from app.json,
 * and on Android a Firebase config in the build; each missing piece yields a readable error.
 */
export async function getExpoPushToken(): Promise<PushTokenResult> {
  if (!Device.isDevice) return { token: null, error: "Push notifications need a physical device." };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { token: null, error: "This build has no EAS project id." };
  try {
    const t = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: t.data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/firebase|FCM|google-services/i.test(msg)) {
      return { token: null, error: "This build was made without the Firebase config, so Android can't receive pushes yet." };
    }
    return { token: null, error: msg };
  }
}

/** Shows what an alert looks like on this phone without involving the server. */
export async function sendLocalPreview(): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Flooding reported near your route",
      body: 'Dangerous flooding was just reported on or near "Home to work". Tap to see the report.',
      sound: true,
      data: { preview: true },
    },
    trigger: null,
  });
}
