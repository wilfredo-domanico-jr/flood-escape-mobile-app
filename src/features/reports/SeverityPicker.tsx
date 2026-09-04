import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { SEVERITIES, SEVERITY_META, type Severity } from "@/constants/severity";

type Props = {
  value: Severity | null;
  onChange: (s: Severity) => void;
  error?: string;
};

/** Four large targets. Icon + label + color together, so color-blind users are not guessing. */
export function SeverityPicker({ value, onChange, error }: Props) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink-secondary">How bad is it?</Text>
      <View className="flex-row flex-wrap gap-2">
        {SEVERITIES.map((s) => {
          const meta = SEVERITY_META[s];
          const selected = value === s;
          return (
            <Pressable
              key={s}
              onPress={() => onChange(s)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${meta.label}. ${meta.help}`}
              className="min-h-[76px] w-[48%] justify-center rounded-card border-2 px-3 py-2"
              style={{
                borderColor: selected ? meta.color : "#E2E8F0",
                backgroundColor: selected ? `${meta.color}1A` : "#FFFFFF",
              }}
            >
              <View className="flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: meta.color }}>
                  <Ionicons name={meta.icon} size={18} color="#fff" />
                </View>
                <Text className="text-base font-bold text-ink">{meta.label}</Text>
              </View>
              <Text className="mt-1 text-xs leading-4 text-ink-secondary" numberOfLines={2}>
                {meta.help}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="text-sm text-severity-impassable">{error}</Text> : null}
    </View>
  );
}
