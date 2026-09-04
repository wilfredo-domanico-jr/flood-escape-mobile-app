import { Text } from "react-native";

import { Screen } from "@/components/ui/Screen";

export default function YouTab() {
  return (
    <Screen>
      <Text className="text-3xl font-bold text-ink">You</Text>
      <Text className="mt-2 text-base text-ink-secondary">
        Your reports, verifications, and settings.
      </Text>
    </Screen>
  );
}
