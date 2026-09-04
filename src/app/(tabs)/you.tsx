import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { ActivityList } from "@/features/activity/ActivityList";
import { syncOutbox } from "@/features/offline/syncOutbox";
import { colors } from "@/constants/theme";
import { selectIsAnonymous, selectUser, useAuthStore } from "@/features/auth/authStore";
import { useProfile } from "@/features/auth/useProfile";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function YouTab() {
  const user = useAuthStore(selectUser);
  const isAnonymous = useAuthStore(selectIsAnonymous);
  const signInError = useAuthStore((s) => s.signInError);
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([syncOutbox(), queryClient.invalidateQueries({ queryKey: ["me"] })]);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-ink">You</Text>
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted"
          >
            <Ionicons name="settings-outline" size={22} color={colors.ink} />
          </Pressable>
        </Link>
      </View>

      <View className="mt-6 rounded-card bg-surface-raised p-4">
        {!isSupabaseConfigured ? (
          <Text className="text-base text-ink-secondary">Connect Supabase to create an account.</Text>
        ) : !user ? (
          <>
            <Text className="text-base font-semibold text-ink">Setting up your account…</Text>
            {signInError ? <Text className="mt-1 text-sm text-severity-impassable">{signInError}</Text> : null}
          </>
        ) : (
          <>
            <View className="flex-row items-center gap-2">
              <Ionicons
                name={isAnonymous ? "person-outline" : "person-circle"}
                size={22}
                color={colors.brand}
              />
              <Text className="text-base font-semibold text-ink">
                {isAnonymous ? "Anonymous account" : (user.email ?? "Account")}
              </Text>
            </View>
            <Text className="mt-1 text-sm text-ink-muted">ID {user.id.slice(0, 8)}</Text>
            {profile.data ? (
              <Text className="mt-2 text-sm text-ink-secondary">
                {profile.data.reports_confirmed} reports confirmed · {profile.data.reports_disputed} disputed
              </Text>
            ) : null}
            {isAnonymous ? (
              <Link href="/settings/account" asChild>
                <Button title="Add email to keep your history" className="mt-4" />
              </Link>
            ) : null}
          </>
        )}
      </View>

      <View className="mt-6">{user ? <ActivityList /> : null}</View>
    </Screen>
  );
}
