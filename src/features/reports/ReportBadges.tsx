import { Text, View } from "react-native";

import { Pill } from "@/components/ui/Pill";
import {
  CONFIDENCE_META,
  type ConfidenceLevel,
  type ReportStatus,
  SEVERITY_META,
  type Severity,
  STATUS_META,
} from "@/constants/severity";

export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "lg" }) {
  const meta = SEVERITY_META[severity];
  if (size === "lg") {
    return (
      <View className="flex-row items-center gap-2 self-start rounded-pill px-3 py-1.5" style={{ backgroundColor: meta.color }}>
        <Text className="text-base font-bold text-white">{meta.label}</Text>
      </View>
    );
  }
  return <Pill label={meta.label} color={meta.color} icon={meta.icon} />;
}

export function ConfidencePill({ level }: { level: ConfidenceLevel }) {
  const meta = CONFIDENCE_META[level];
  return <Pill label={meta.label.replace(" confidence", "")} color={meta.color} icon="shield-checkmark-outline" />;
}

export function StatusPill({ status }: { status: ReportStatus }) {
  if (status === "active") return null;
  const meta = STATUS_META[status];
  return <Pill label={meta.label} dark={false} icon={status === "resolved" ? "checkmark-circle-outline" : "time-outline"} />;
}
