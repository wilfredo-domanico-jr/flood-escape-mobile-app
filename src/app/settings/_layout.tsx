import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.ink, fontWeight: "600" },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
    </Stack>
  );
}
