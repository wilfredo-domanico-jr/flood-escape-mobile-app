import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import { CONFIDENCE_META, type ConfidenceLevel, type ReportStatus, STATUS_META } from "@/constants/severity";

type Props = {
  level: ConfidenceLevel;
  score: number;
  reasons: string[];
  status: ReportStatus;
};

/** Explains the trust level in plain words. Never shows a bare number without its reasons. */
export function ConfidenceCard({ level, score, reasons, status }: Props) {
  const meta = CONFIDENCE_META[level];
  const statusMeta = STATUS_META[status];
  return (
    <View className="gap-2 rounded-card bg-surface-raised p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="shield-checkmark-outline" size={20} color={meta.color} />
        <Text className="text-base font-bold text-ink">{meta.label}</Text>
        <Text className="text-sm text-ink-muted" accessibilityLabel={`score ${score} of 100`}>
          {score}/100
        </Text>
      </View>
      <Text className="text-sm text-ink-secondary">{meta.summary}</Text>
      {status !== "active" ? (
        <Text className="text-sm text-ink-secondary">
          <Text className="font-semibold text-ink">{statusMeta.label}.</Text> {statusMeta.hint}
        </Text>
      ) : null}
      {reasons.length > 0 ? (
        <View className="mt-1 gap-1">
          {reasons.map((r) => (
            <View key={r} className="flex-row items-start gap-2">
              <Text className="text-sm text-ink-muted">•</Text>
              <Text className="flex-1 text-sm text-ink">{r}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text className="mt-1 text-xs leading-4 text-ink-muted">
        Reports come from people nearby and can be wrong or out of date. Use this as one signal, not a guarantee.
      </Text>
    </View>
  );
}
