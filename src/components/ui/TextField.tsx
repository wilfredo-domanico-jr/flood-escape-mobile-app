import { Text, TextInput, View, type TextInputProps } from "react-native";

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, className, ...rest }: Props) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-ink-secondary">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#94A3B8"
        className={`min-h-[48px] rounded-card border bg-surface-raised px-4 py-3 text-base text-ink ${
          error ? "border-severity-impassable" : "border-slate-200"
        } ${className ?? ""}`}
        {...rest}
      />
      {error ? (
        <Text className="text-sm text-severity-impassable" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-sm text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
