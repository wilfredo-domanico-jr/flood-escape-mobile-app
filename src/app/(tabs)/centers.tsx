import { Text } from "react-native";

import { Screen } from "@/components/ui/Screen";

export default function CentersTab() {
  return (
    <Screen>
      <Text className="text-3xl font-bold text-ink">Evacuation centers</Text>
      <Text className="mt-2 text-base text-ink-secondary">
        Nearby evacuation centers, hospitals, fire and police stations with directions.
      </Text>
    </Screen>
  );
}
