import { Text, View } from "react-native";

import type { ReportStatus } from "@/constants/severity";

import type { VerificationEvent } from "./useReport";

type Props = {
  reportId: string;
  reportLat: number;
  reportLng: number;
  status: ReportStatus;
  myVerification: VerificationEvent | null;
};

// Phase 6 replaces this with the working Still flooded / No longer flooded controls.
export function VerifyActions({ status }: Props) {
  if (status === "resolved") return null;
  return (
    <View className="rounded-card bg-surface-muted p-4">
      <Text className="text-sm text-ink-secondary">Verification arrives in the next step.</Text>
    </View>
  );
}
