import type { PropsWithChildren } from "react";
import { type RefreshControlProps, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OfflineBanner } from "./OfflineBanner";

type Props = PropsWithChildren<{
  /** Extra classes for the scroll container. Map screens use their own layout. */
  className?: string;
  /** Hide the connectivity banner (the map shows its own chips). */
  hideBanner?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}>;

export function Screen({ children, className, hideBanner, refreshControl }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className={`flex-1 bg-surface ${className ?? ""}`}
      contentContainerClassName="px-5 pb-8"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {hideBanner ? null : <OfflineBanner />}
      {children}
    </ScrollView>
  );
}
