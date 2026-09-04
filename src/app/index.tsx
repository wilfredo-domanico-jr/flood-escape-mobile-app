import { Redirect } from "expo-router";

import { useAuthStore } from "@/features/auth/authStore";

export default function Index() {
  const onboardingDone = useAuthStore((s) => s.onboardingDone);
  return <Redirect href={onboardingDone ? "/(tabs)" : "/onboarding"} />;
}
