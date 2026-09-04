import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@/constants/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function RoundButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-12 w-12 items-center justify-center rounded-full bg-surface-raised shadow"
      style={{ elevation: 3 }}
    >
      <Ionicons name={icon} size={22} color={active ? colors.brand : colors.ink} />
    </Pressable>
  );
}

export function StatusChip({
  icon,
  label,
  color,
}: {
  icon: IconName;
  label: string;
  color: string;
}) {
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5"
      style={{ backgroundColor: color }}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={icon} size={14} color="#fff" />
      <Text className="text-xs font-semibold text-white">{label}</Text>
    </View>
  );
}
