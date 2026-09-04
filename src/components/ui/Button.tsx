import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
};

const container: Record<Variant, string> = {
  primary: "bg-brand active:bg-brand/90",
  secondary: "bg-surface-muted active:bg-surface-muted/80",
  danger: "bg-severity-impassable active:bg-severity-impassable/90",
  ghost: "bg-transparent active:bg-surface-muted",
};

const label: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-ink",
  danger: "text-white",
  ghost: "text-brand",
};

export function Button({ title, variant = "primary", loading, disabled, className, ...rest }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={`min-h-[48px] flex-row items-center justify-center rounded-card px-5 py-3 ${container[variant]} ${
        isDisabled ? "opacity-50" : ""
      } ${className ?? ""}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#fff" : "#0E7490"} />
      ) : (
        <Text className={`text-base font-semibold ${label[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}
