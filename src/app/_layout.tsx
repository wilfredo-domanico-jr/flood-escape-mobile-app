import "../../global.css";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { useAuthStore } from "@/features/auth/authStore";
import { QUERY_CACHE_MAX_AGE_MS, queryClient, queryPersister } from "@/lib/query/queryClient";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootStack() {
  const onboardingDone = useAuthStore((s) => s.onboardingDone);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!onboardingDone}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingDone}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: QUERY_CACHE_MAX_AGE_MS }}
      >
        <AuthProvider>
          <RootStack />
        </AuthProvider>
        <StatusBar style="auto" />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
