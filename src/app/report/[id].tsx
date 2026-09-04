import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

import { Screen } from "@/components/ui/Screen";

// Phase 5 replaces this with the full details screen.
export default function ReportDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Text className="text-2xl font-bold text-ink">Report</Text>
      <Text className="mt-2 text-sm text-ink-muted">{id}</Text>
    </Screen>
  );
}
