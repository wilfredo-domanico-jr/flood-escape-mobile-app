import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SEVERITIES, SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { sendLocalPreview } from "@/features/notifications/push";
import { usePushStore } from "@/features/notifications/pushStore";
import { useNotificationPrefs, useSaveNotificationPrefs } from "@/features/notifications/usePreferences";
import { DEFAULT_NOTIFICATION_PREFS, formatTimeOfDay, type NotificationPrefs, parseTimeOfDay } from "@/lib/notifications/rules";

function SwitchRow({ title, body, value, onChange, disabled }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View className={`flex-row items-center gap-3 rounded-card bg-surface-raised p-4 ${disabled ? "opacity-50" : ""}`}>
      <View className="flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-ink-secondary">{body}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.brand }} accessibilityLabel={title} />
    </View>
  );
}

function HourStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const minutes = parseTimeOfDay(value);
  const step = (delta: number) => onChange(formatTimeOfDay(minutes + delta * 60));
  return (
    <View className="flex-1 items-center gap-1">
      <Text className="text-xs uppercase text-ink-muted">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={`${label} one hour earlier`} className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name="remove" size={20} color={colors.ink} />
        </Pressable>
        <Text className="w-16 text-center text-xl font-semibold text-ink">{formatTimeOfDay(minutes)}</Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={`${label} one hour later`} className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name="add" size={20} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function PermissionCard() {
  const permission = usePushStore((s) => s.permission);
  const token = usePushStore((s) => s.token);
  const tokenError = usePushStore((s) => s.tokenError);
  const busy = usePushStore((s) => s.busy);
  const requestAndRegister = usePushStore((s) => s.requestAndRegister);

  if (permission === "granted" && token) {
    return (
      <View className="flex-row items-center gap-3 rounded-card bg-surface-raised p-4">
        <Ionicons name="checkmark-circle" size={22} color={colors.confidence.high} />
        <Text className="flex-1 text-sm text-ink-secondary">This phone is registered for alerts.</Text>
      </View>
    );
  }
  if (permission === "granted") {
    return (
      <View className="gap-2 rounded-card bg-surface-raised p-4">
        <View className="flex-row items-center gap-3">
          <Ionicons name="alert-circle" size={22} color={colors.severity.caution} />
          <Text className="flex-1 text-base font-semibold text-ink">Alerts allowed, but not set up on this build</Text>
        </View>
        <Text className="text-sm leading-5 text-ink-secondary">{tokenError ?? "Retrying in the background."}</Text>
      </View>
    );
  }
  if (permission === "denied") {
    return (
      <View className="gap-3 rounded-card bg-surface-raised p-4">
        <View className="flex-row items-center gap-3">
          <Ionicons name="notifications-off" size={22} color={colors.inkMuted} />
          <Text className="flex-1 text-base font-semibold text-ink">Notifications are off for Flood Escape</Text>
        </View>
        <Text className="text-sm leading-5 text-ink-secondary">Allow them in system settings to get route alerts.</Text>
        <Button title="Open system settings" variant="secondary" onPress={() => void Linking.openSettings()} />
      </View>
    );
  }
  return (
    <View className="gap-3 rounded-card bg-surface-raised p-4">
      <View className="flex-row items-center gap-3">
        <Ionicons name="notifications-outline" size={22} color={colors.brand} />
        <Text className="flex-1 text-base font-semibold text-ink">Allow alerts on this phone</Text>
      </View>
      <Text className="text-sm leading-5 text-ink-secondary">
        Only for routes you save. Nothing is sent about reports elsewhere.
      </Text>
      <Button title="Allow notifications" onPress={() => void requestAndRegister()} loading={busy} />
    </View>
  );
}

export default function NotificationsScreen() {
  const prefsQuery = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const prefs = prefsQuery.data ?? DEFAULT_NOTIFICATION_PREFS;
  const [previewBusy, setPreviewBusy] = useState(false);

  const update = (patch: Partial<NotificationPrefs>) => save.mutate({ ...prefs, ...patch });

  const preview = async () => {
    setPreviewBusy(true);
    try {
      const store = usePushStore.getState();
      const permission = (await store.refreshPermission()) === "granted" ? "granted" : await store.requestAndRegister().then(() => store.permission);
      if (permission !== "granted") {
        Alert.alert("Notifications are off", "Allow them first to see a preview.");
        return;
      }
      await sendLocalPreview();
    } catch (e) {
      Alert.alert("Couldn't show a preview", e instanceof Error ? e.message : "Try again.");
    } finally {
      setPreviewBusy(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="gap-3 px-5 py-4">
      <Text className="text-sm leading-5 text-ink-secondary">
        Alerts are only about routes you saved on the Route tab. One alert per route every 30 minutes at most.
      </Text>

      <PermissionCard />

      <SwitchRow
        title="Route alerts"
        body="Push when someone reports flooding on or near a saved route."
        value={prefs.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      <View className={`gap-3 rounded-card bg-surface-raised p-4 ${prefs.enabled ? "" : "opacity-50"}`}>
        <Text className="text-base font-semibold text-ink">Alert me from</Text>
        <View className="flex-row flex-wrap gap-2">
          {SEVERITIES.map((s) => {
            const meta = SEVERITY_META[s];
            const on = prefs.minSeverity === s;
            return (
              <Pressable
                key={s}
                onPress={() => update({ minSeverity: s })}
                disabled={!prefs.enabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                className="flex-row items-center gap-1.5 rounded-pill border px-3 py-1.5"
                style={{ borderColor: on ? meta.color : "#E2E8F0", backgroundColor: on ? `${meta.color}1A` : "#FFFFFF" }}
              >
                <Ionicons name={meta.icon} size={14} color={on ? meta.color : colors.inkMuted} />
                <Text className="text-sm font-semibold" style={{ color: on ? colors.ink : colors.inkMuted }}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-sm leading-5 text-ink-secondary">
          {prefs.minSeverity === "passable"
            ? "Every report, including shallow water."
            : `${SEVERITY_META[prefs.minSeverity].label} and worse.`}
        </Text>
      </View>

      <View className={`gap-3 rounded-card bg-surface-raised p-4 ${prefs.enabled ? "" : "opacity-50"}`}>
        <Text className="text-base font-semibold text-ink">Quiet hours</Text>
        <View className="flex-row gap-3">
          <HourStepper label="From" value={prefs.quietStart} onChange={(v) => update({ quietStart: v })} />
          <HourStepper label="Until" value={prefs.quietEnd} onChange={(v) => update({ quietEnd: v })} />
        </View>
        <Text className="text-sm leading-5 text-ink-secondary">
          {prefs.quietStart === prefs.quietEnd
            ? "No quiet hours."
            : `No alerts between ${formatTimeOfDay(parseTimeOfDay(prefs.quietStart))} and ${formatTimeOfDay(parseTimeOfDay(prefs.quietEnd))}, except when a road is impassable.`}
        </Text>
      </View>

      <SwitchRow
        title="Tell me when reports clear"
        body="A push once every report along a saved route is marked as no longer flooded."
        value={prefs.notifyCleared}
        onChange={(v) => update({ notifyCleared: v })}
        disabled={!prefs.enabled}
      />

      {save.isError ? <Text className="text-sm text-severity-impassable">Couldn&apos;t save. Check your connection and try again.</Text> : null}

      <View className="mt-2 gap-2">
        <Button title="Show me an example alert" variant="secondary" onPress={() => void preview()} loading={previewBusy} />
        <Text className="text-center text-xs text-ink-muted">Sent from this phone only, to check how alerts look and sound.</Text>
      </View>
    </ScrollView>
  );
}
