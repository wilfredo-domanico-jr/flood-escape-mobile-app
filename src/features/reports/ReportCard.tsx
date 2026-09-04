import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { formatDistance } from "@/lib/geo/distance";
import { formatAge } from "@/lib/format/relativeTime";
import type { PublicReport } from "@/lib/supabase/database.types";

import { ConfidencePill, StatusPill } from "./ReportBadges";

type Props = {
  report: PublicReport;
  distanceM?: number | null;
  onPress?: () => void;
  selected?: boolean;
  /** Present for optimistic, not-yet-synced reports. */
  pending?: boolean;
};

export function ReportCard({ report, distanceM, onPress, selected, pending }: Props) {
  const meta = SEVERITY_META[report.severity];
  const stale = report.effective_status === "stale";
  const age = formatAge(report.last_confirmed_at);
  const confirmedLater = report.last_confirmed_at !== report.created_at;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} flooding, ${age}${distanceM != null ? `, ${formatDistance(distanceM)} away` : ""}`}
      className={`flex-row gap-3 rounded-card border bg-surface-raised p-3 ${
        selected ? "border-brand" : "border-transparent"
      } ${stale ? "opacity-70" : ""}`}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.color }}
        accessibilityElementsHidden
      >
        <Ionicons name={meta.icon} size={22} color="#fff" />
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-ink">{meta.label}</Text>
          {distanceM != null ? (
            <Text className="text-sm text-ink-muted">· {formatDistance(distanceM)}</Text>
          ) : null}
          {report.has_photo ? <Ionicons name="image-outline" size={16} color={colors.inkMuted} /> : null}
        </View>
        <Text className="text-sm text-ink-secondary">
          {pending ? "Sending…" : `${confirmedLater ? "Confirmed" : "Reported"} ${age}`}
          {report.confirm_count > 0 ? ` · ${report.confirm_count} confirmed` : ""}
        </Text>
        {report.description ? (
          <Text className="text-sm text-ink" numberOfLines={2}>
            {report.description}
          </Text>
        ) : null}
        <View className="mt-1 flex-row flex-wrap gap-2">
          <ConfidencePill level={report.confidence_level} />
          <StatusPill status={report.effective_status} />
        </View>
      </View>
    </Pressable>
  );
}
