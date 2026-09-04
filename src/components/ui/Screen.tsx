import type { PropsWithChildren } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = PropsWithChildren<{
  /** Extra classes for the scroll container. Map screens will use their own layout later. */
  className?: string;
}>;

export function Screen({ children, className }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className={`flex-1 bg-surface ${className ?? ""}`}
      contentContainerClassName="px-5 pb-8"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
