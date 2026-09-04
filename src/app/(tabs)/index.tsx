import { Text, View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { SupabaseStatus } from "@/features/health/SupabaseStatus";

export default function MapTab() {
  return (
    <Screen>
      <View className="gap-2">
        <Text className="text-3xl font-bold text-ink">Flood Escape</Text>
        <Text className="text-base text-ink-secondary">
          Community flood reports near you. Every report shows how recent it is and how much it has
          been confirmed.
        </Text>
      </View>

      <View className="mt-6 rounded-card bg-surface-raised p-4 shadow-sm">
        <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Phase 1 foundation
        </Text>
        <Text className="mt-1 text-base text-ink">
          Map, reports, and route safety arrive in the next phases.
        </Text>
      </View>

      <SupabaseStatus />
    </Screen>
  );
}
