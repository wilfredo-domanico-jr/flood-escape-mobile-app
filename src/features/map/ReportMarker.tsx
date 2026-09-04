import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { View } from "react-native";
import { Marker } from "react-native-maps";

import { SEVERITY_META } from "@/constants/severity";
import type { PublicReport } from "@/lib/supabase/database.types";

type Props = {
  report: PublicReport;
  selected: boolean;
  onPress: (id: string) => void;
};

function ReportMarkerInner({ report, selected, onPress }: Props) {
  const meta = SEVERITY_META[report.severity];
  const stale = report.effective_status === "stale";
  const resolved = report.effective_status === "resolved";
  const size = selected ? 40 : 32;

  return (
    <Marker
      identifier={report.id}
      coordinate={{ latitude: report.lat, longitude: report.lng }}
      onPress={() => onPress(report.id)}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      accessibilityLabel={`${meta.label} flooding${stale ? ", may have receded" : ""}`}
      zIndex={selected ? 10 : report.confidence_level === "high" ? 3 : 1}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: meta.color,
          opacity: stale || resolved ? 0.45 : 1,
          borderWidth: selected ? 4 : 3,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      >
        <Ionicons name={meta.icon} size={selected ? 20 : 16} color="#fff" />
      </View>
    </Marker>
  );
}

/** Re-render only when the row actually changed; react-native-maps markers are expensive. */
export const ReportMarker = memo(
  ReportMarkerInner,
  (a, b) =>
    a.selected === b.selected &&
    a.report.id === b.report.id &&
    a.report.updated_at === b.report.updated_at &&
    a.report.effective_status === b.report.effective_status,
);
