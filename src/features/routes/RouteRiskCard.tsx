import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { RouteRisk } from "@/lib/geo/routeRisk";
import { formatAge } from "@/lib/format/relativeTime";

const TONE = {
  safe: { color: colors.confidence.high, icon: "checkmark-circle" as const, label: "NO RECENT REPORTS" },
  caution: { color: colors.severity.caution, icon: "alert-circle" as const, label: "CAUTION" },
  high: { color: colors.severity.impassable, icon: "warning" as const, label: "HIGH RISK" },
};

export function RouteRiskCard({
  risk,
  fetchedAt,
  stale,
  distanceM,
  durationS,
}: {
  risk: RouteRisk;
  fetchedAt: string;
  stale: boolean;
  distanceM: number | null;
  durationS: number | null;
}) {
  const tone = TONE[risk.level];
  return (
    <View className="gap-2 rounded-card p-4" style={{ backgroundColor: `${tone.color}1A`, borderColor: tone.color, borderWidth: 1 }}>
      <View className="flex-row items-center gap-2">
        <Ionicons name={tone.icon} size={26} color={tone.color} />
        <Text className="text-xl font-bold" style={{ color: tone.color }} accessibilityRole="header">
          {tone.label}
        </Text>
      </View>
      <Text className="text-base leading-6 text-ink">{risk.detail}</Text>
      <Text className="text-xs text-ink-muted">
        {distanceM != null ? `${(distanceM / 1000).toFixed(1)} km` : ""}
        {durationS != null ? ` · about ${Math.max(1, Math.round(durationS / 60))} min` : ""}
        {` · checked ${formatAge(fetchedAt)}`}
        {stale ? " · may be out of date" : ""}
      </Text>
    </View>
  );
}
