import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { type ComponentProps, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ensureAnonymousSession } from "@/features/auth/AuthProvider";
import { useAuthStore } from "@/features/auth/authStore";
import { setOnboardingDone } from "@/features/auth/onboarding";
import { colors } from "@/constants/theme";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type IconName = ComponentProps<typeof Ionicons>["name"];

const POINTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "water",
    title: "See flooding near you",
    body: "Reports from people nearby, with how recent and how confirmed each one is.",
  },
  {
    icon: "navigate",
    title: "Check your route first",
    body: "Find out whether recent flood reports fall along the way before you leave.",
  },
  {
    icon: "megaphone",
    title: "Warn others in seconds",
    body: "Tap once, pick a severity, and your report helps everyone around you.",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const markDone = useAuthStore((s) => s.setOnboardingDone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    markDone(true);
    router.replace("/(tabs)");
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    await setOnboardingDone();
    if (!isSupabaseConfigured) {
      finish();
      return;
    }
    try {
      await ensureAnonymousSession();
      finish();
    } catch {
      setError(useAuthStore.getState().signInError ?? "Couldn't set up your account.");
      setBusy(false);
    }
  };

  return (
    <View
      className="flex-1 bg-surface px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-1 justify-center gap-10">
        <View className="gap-2">
          <Text className="text-4xl font-bold text-ink">Flood Escape</Text>
          <Text className="text-lg text-ink-secondary">Is my route safe right now?</Text>
        </View>

        <View className="gap-6">
          {POINTS.map((p) => (
            <View key={p.title} className="flex-row gap-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                <Ionicons name={p.icon} size={22} color={colors.brand} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-base font-semibold text-ink">{p.title}</Text>
                <Text className="text-base leading-6 text-ink-secondary">{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text className="text-sm leading-5 text-ink-muted">
          Reports come from people like you and can be wrong or out of date. Flood Escape always shows
          how recent and how confirmed each one is, and never guarantees a road is clear.
        </Text>
      </View>

      <View className="gap-3">
        {error ? (
          <Text className="text-center text-sm text-severity-impassable" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button title={error ? "Try again" : "Get started"} onPress={start} loading={busy} />
        {error ? <Button title="Continue without an account for now" variant="ghost" onPress={finish} /> : null}
        <Text className="text-center text-xs text-ink-muted">
          No sign-up needed. You can add an email later to keep your history.
        </Text>
      </View>
    </View>
  );
}
