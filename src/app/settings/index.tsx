import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { Link } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { selectIsAnonymous, selectUser, useAuthStore } from "@/features/auth/authStore";
import { SupabaseStatus } from "@/features/health/SupabaseStatus";

type IconName = ComponentProps<typeof Ionicons>["name"];

function Row({
  icon,
  title,
  subtitle,
  disabled,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  disabled?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-4 rounded-card bg-surface-raised px-4 py-4 ${disabled ? "opacity-50" : ""}`}
    >
      <Ionicons name={icon} size={22} color={colors.brand} />
      <View className="flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="text-sm text-ink-secondary">{subtitle}</Text> : null}
      </View>
      {disabled ? null : <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />}
    </View>
  );
}

export default function SettingsScreen() {
  const user = useAuthStore(selectUser);
  const isAnonymous = useAuthStore(selectIsAnonymous);
  const version = Constants.expoConfig?.version ?? "dev";

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="gap-3 px-5 py-4">
      <Link href="/settings/account" asChild>
        <Pressable accessibilityRole="button">
          <Row
            icon="person-circle"
            title="Account"
            subtitle={isAnonymous ? "Anonymous — add an email to keep your history" : (user?.email ?? "")}
          />
        </Pressable>
      </Link>
      <Row icon="notifications" title="Notifications" subtitle="Coming soon" disabled />
      <Link href="/settings/privacy" asChild>
        <Pressable accessibilityRole="button">
          <Row icon="shield-checkmark" title="Privacy" subtitle="Location blur, photo uploads, delete my data" />
        </Pressable>
      </Link>
      <SupabaseStatus />
      <Text className="mt-4 text-center text-xs text-ink-muted">Flood Escape {version}</Text>
    </ScrollView>
  );
}
