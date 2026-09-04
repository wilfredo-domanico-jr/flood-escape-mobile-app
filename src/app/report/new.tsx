import { Text } from "react-native";

import { Screen } from "@/components/ui/Screen";

// Phase 4 replaces this with the fast reporting flow.
export default function NewReportScreen() {
  return (
    <Screen>
      <Text className="text-2xl font-bold text-ink">Report flooding</Text>
      <Text className="mt-2 text-base text-ink-secondary">Coming in the next step.</Text>
    </Screen>
  );
}
