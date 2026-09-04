import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import type { ReportStatus } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { useVerify } from "@/features/verification/useVerify";
import { useLocation } from "@/hooks/useLocation";
import { formatDistance, haversineDistanceM } from "@/lib/geo/distance";
import { formatAge } from "@/lib/format/relativeTime";

import type { VerificationEvent } from "./useReport";

export const VERIFY_RADIUS_M = 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

type Props = {
  reportId: string;
  reportLat: number;
  reportLng: number;
  status: ReportStatus;
  myVerification: VerificationEvent | null;
};

export function VerifyActions({ reportId, reportLat, reportLng, status, myVerification }: Props) {
  const { permission, fix, request } = useLocation();
  const { vote, busy, message } = useVerify(reportId);
  // Captured once per mount; a cooldown boundary crossing mid-screen is not worth a timer.
  const [now] = useState(() => Date.now());

  if (status === "resolved") return null;

  const distanceM = fix ? haversineDistanceM({ lat: fix.lat, lng: fix.lng }, { lat: reportLat, lng: reportLng }) : null;
  const tooFar = distanceM != null && distanceM > VERIFY_RADIUS_M;
  const recent =
    myVerification && now - Date.parse(myVerification.created_at) < COOLDOWN_MS ? myVerification : null;

  let blocker: string | null = null;
  if (permission !== "granted") blocker = "Turn on location to verify. You need to be within 1 km of the report.";
  else if (!fix) blocker = "Finding your location…";
  else if (tooFar) blocker = `You're ${formatDistance(distanceM!)} away. Verification needs you within 1 km so answers come from people on the spot.`;

  const location = fix ? { lat: fix.lat, lng: fix.lng } : null;

  return (
    <View className="gap-3 rounded-card bg-surface-raised p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="people-outline" size={20} color={colors.brand} />
        <Text className="text-base font-bold text-ink">Are you nearby? Help others.</Text>
      </View>
      <Text className="text-sm text-ink-secondary">
        Your answer is counted separately from the original report and is never shown with your identity.
      </Text>

      {recent ? (
        <Text className="text-sm text-ink">
          You said it {recent.kind === "confirm" ? "was still flooded" : "had cleared"} {formatAge(recent.created_at)}.
        </Text>
      ) : null}

      {blocker ? (
        <View className="gap-2">
          <Text className="text-sm text-ink-secondary">{blocker}</Text>
          {permission !== "granted" ? (
            <Button title={permission === "blocked" ? "Open settings" : "Enable location"} variant="secondary" onPress={request} />
          ) : null}
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button
            title="Still flooded"
            className="flex-1"
            onPress={() => vote("confirm", location)}
            loading={busy === "confirm"}
            disabled={busy !== null || recent?.kind === "confirm"}
          />
          <Button
            title="No longer flooded"
            variant="secondary"
            className="flex-1"
            onPress={() => vote("clear", location)}
            loading={busy === "clear"}
            disabled={busy !== null || recent?.kind === "clear"}
          />
        </View>
      )}

      {message ? (
        <Text className="text-sm text-ink-secondary" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
