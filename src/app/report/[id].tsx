import { useLocalSearchParams } from "expo-router";

import { ReportDetailsScreen } from "@/features/reports/ReportDetailsScreen";

export default function ReportDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailsScreen id={id} />;
}
