import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { syncOutbox } from "@/features/offline/syncOutbox";
import { useAppStore } from "@/store/useAppStore";

/** One line of truth about connectivity and the outbox. Renders nothing when all is well. */
export function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingCount = useAppStore((s) => s.pendingCount);

  if (isOnline && syncStatus === "idle") return null;

  let icon: "cloud-offline-outline" | "sync-outline" | "alert-circle-outline" = "cloud-offline-outline";
  let text = "Offline. Showing saved data.";
  let tint: string = colors.inkMuted;
  if (!isOnline && pendingCount > 0) {
    text = `Offline. ${pendingCount} item${pendingCount === 1 ? "" : "s"} will send when you're back online.`;
  } else if (isOnline && syncStatus === "syncing") {
    icon = "sync-outline";
    text = "Sending queued items…";
    tint = colors.brand;
  } else if (isOnline && syncStatus === "pending") {
    icon = "sync-outline";
    text = `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting to send. Tap to retry now.`;
    tint = colors.brand;
  } else if (isOnline && syncStatus === "failed") {
    icon = "alert-circle-outline";
    text = "Some items couldn't be sent. Check Activity.";
    tint = colors.severity.caution;
  }

  return (
    <Pressable
      onPress={() => void syncOutbox()}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      className="mb-3 flex-row items-center gap-2 rounded-card px-3 py-2"
      style={{ backgroundColor: `${tint}1F` }}
    >
      <Ionicons name={icon} size={16} color={tint} />
      <Text className="flex-1 text-sm text-ink">{text}</Text>
      <View accessibilityElementsHidden />
    </Pressable>
  );
}
