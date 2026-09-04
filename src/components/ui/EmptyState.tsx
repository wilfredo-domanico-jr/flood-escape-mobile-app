import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import { colors } from "@/constants/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <View className="items-center gap-2 px-6 py-8">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons name={icon} size={26} color={colors.inkMuted} />
      </View>
      <Text className="text-center text-base font-semibold text-ink">{title}</Text>
      {body ? <Text className="text-center text-sm leading-5 text-ink-secondary">{body}</Text> : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}
