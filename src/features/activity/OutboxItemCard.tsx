import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { sqliteOutbox } from "@/features/offline/outbox";
import { syncOutbox } from "@/features/offline/syncOutbox";
import type { PendingReport } from "@/features/offline/usePendingReports";
import { deleteStashedPhoto } from "@/lib/media/compressPhoto";
import { formatAge } from "@/lib/format/relativeTime";

/** A queued or failed report from the outbox, with retry and discard. */
export function OutboxItemCard({ item, photoUri }: { item: PendingReport; photoUri: string | null }) {
  const meta = SEVERITY_META[item.payload.severity];
  const failed = item.status === "failed";
  const photoOnly = item.kind === "media";

  const title = photoOnly
    ? failed
      ? "Photo didn't upload"
      : "Report sent, photo still uploading"
    : failed
      ? "Report couldn't be sent"
      : item.status === "sending"
        ? "Sending…"
        : "Waiting to send";

  const discard = () =>
    Alert.alert(
      photoOnly ? "Discard the photo?" : "Discard this report?",
      photoOnly ? "The report stays; only the photo is dropped." : "It was never sent, so nobody will see it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await sqliteOutbox.remove(item.clientId);
            if (photoUri) await deleteStashedPhoto(photoUri).catch(() => {});
          },
        },
      ],
    );

  const retry = async () => {
    await sqliteOutbox.retryNow(item.clientId);
    void syncOutbox();
  };

  return (
    <View className={`gap-2 rounded-card border p-3 ${failed ? "border-severity-caution bg-surface-raised" : "border-transparent bg-surface-raised"}`}>
      <View className="flex-row items-center gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: meta.color }}>
          <Ionicons name={meta.icon} size={18} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{title}</Text>
          <Text className="text-sm text-ink-secondary">
            {meta.label} · created {formatAge(new Date(item.createdAt).toISOString())}
            {item.attempts > 0 ? ` · ${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
        <Ionicons
          name={failed ? "alert-circle" : "time-outline"}
          size={20}
          color={failed ? colors.severity.caution : colors.inkMuted}
        />
      </View>
      {item.lastError ? <Text className="text-sm text-ink-secondary">{item.lastError}</Text> : null}
      {failed ? (
        <View className="flex-row gap-2">
          <Button title="Retry" className="flex-1" onPress={retry} />
          <Button title="Discard" variant="secondary" className="flex-1" onPress={discard} />
        </View>
      ) : (
        <Button title="Cancel" variant="ghost" onPress={discard} />
      )}
    </View>
  );
}
