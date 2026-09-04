import { Text } from "react-native";

import { Screen } from "@/components/ui/Screen";

export default function RouteTab() {
  return (
    <Screen>
      <Text className="text-3xl font-bold text-ink">Route safety</Text>
      <Text className="mt-2 text-base text-ink-secondary">
        Enter a destination to check whether recent flood reports fall along the way.
      </Text>
    </Screen>
  );
}
