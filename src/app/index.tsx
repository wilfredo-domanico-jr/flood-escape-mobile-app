import { Redirect } from "expo-router";

// Onboarding gate lands here in Phase 2; for now go straight to the tabs.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
