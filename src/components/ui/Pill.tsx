import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  label: string;
  /** Background color (hex). Text is white unless `dark` is false. */
  color?: string;
  icon?: IconName;
  dark?: boolean;
  className?: string;
};

export function Pill({ label, color, icon, dark = true, className }: Props) {
  const fg = dark ? "#FFFFFF" : "#0F172A";
  return (
    <View
      className={`flex-row items-center gap-1 self-start rounded-pill px-2.5 py-1 ${className ?? ""}`}
      style={{ backgroundColor: color ?? "#EEF2F6" }}
      accessibilityRole="text"
    >
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <Text className="text-xs font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
