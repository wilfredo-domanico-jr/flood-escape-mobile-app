import { Alert, Linking } from "react-native";

import { usePushStore } from "./pushStore";

/**
 * Asked once, right after a route is saved, which is the moment the permission makes sense.
 * Never prompts on launch. A denied permission gets a pointer to system settings instead.
 */
export async function promptForRouteAlerts(routeName: string): Promise<void> {
  const store = usePushStore.getState();
  const permission = await store.refreshPermission();
  if (permission === "granted") {
    await store.registerIfAllowed();
    return;
  }
  if (permission === "denied") {
    Alert.alert(
      "Alerts are off",
      `"${routeName}" is saved. To be warned when it floods, allow notifications for Flood Escape in system settings.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => void Linking.openSettings() },
      ],
    );
    return;
  }
  Alert.alert(
    "Warn you if this route floods?",
    `We'll send a push when someone reports flooding on or near "${routeName}". At most one alert per route every 30 minutes, and quiet at night unless a road is impassable.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Turn on", onPress: () => void store.requestAndRegister() },
    ],
  );
}
