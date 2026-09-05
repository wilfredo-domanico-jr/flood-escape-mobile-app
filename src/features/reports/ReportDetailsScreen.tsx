import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExpoGoBaseTiles, ExpoGoTileAttribution, USE_OSM_FALLBACK_TILES } from "@/components/map/ExpoGoBaseMap";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { useLocation } from "@/hooks/useLocation";
import { formatDistance, haversineDistanceM } from "@/lib/geo/distance";
import { formatAge, formatUntil } from "@/lib/format/relativeTime";
import { useAppStore } from "@/store/useAppStore";

import { photoUrlFor } from "./api";
import { ConfidenceCard } from "./ConfidenceCard";
import { SeverityBadge, StatusPill } from "./ReportBadges";
import { useReport, useResolveOwnReport } from "./useReport";
import { VerifyActions } from "./VerifyActions";

export function ReportDetailsScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isOnline = useAppStore((s) => s.isOnline);
  const { fix } = useLocation();
  const detail = useReport(id);
  const resolve = useResolveOwnReport(id);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  const header = (
    <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <Pressable
        onPress={back}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted"
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </Pressable>
      <Text className="flex-1 text-xl font-bold text-ink">Flood report</Text>
    </View>
  );

  if (detail.isPending && !detail.data) {
    return (
      <View className="flex-1 bg-surface">
        {header}
        <Text className="px-4 text-base text-ink-secondary">Loading report…</Text>
      </View>
    );
  }

  if (!detail.data) {
    return (
      <View className="flex-1 bg-surface">
        {header}
        <EmptyState
          icon={isOnline ? "help-circle-outline" : "cloud-offline-outline"}
          title={isOnline ? "This report is no longer available" : "You're offline"}
          body={
            isOnline
              ? "It may have been removed, or the link is wrong."
              : "This report isn't cached on your phone. Connect to load it."
          }
          action={<Button title="Back to map" variant="secondary" onPress={back} />}
        />
      </View>
    );
  }

  const { report, is_mine, my_verification, activity } = detail.data;
  const meta = SEVERITY_META[report.severity];
  const distanceM = fix ? haversineDistanceM({ lat: fix.lat, lng: fix.lng }, { lat: report.lat, lng: report.lng }) : null;
  const confirmedLater = report.last_confirmed_at !== report.created_at;
  const photoUrl = photoUrlFor(report.photo_path);
  const isOpen = report.effective_status !== "resolved";

  const confirmResolve = () =>
    Alert.alert("Mark as no longer flooded?", "This closes your report for everyone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Mark cleared", style: "destructive", onPress: () => resolve.mutate() },
    ]);

  return (
    <View className="flex-1 bg-surface">
      {header}
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <View className="overflow-hidden rounded-card" style={{ height: 160 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{ latitude: report.lat, longitude: report.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            liteMode={!USE_OSM_FALLBACK_TILES}
            accessibilityLabel="Map showing the report location"
          >
            <ExpoGoBaseTiles />
            <Marker coordinate={{ latitude: report.lat, longitude: report.lng }} pinColor={meta.color} />
          </MapView>
          <ExpoGoTileAttribution />
        </View>

        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <SeverityBadge severity={report.severity} size="lg" />
            <StatusPill status={report.effective_status} />
          </View>
          <Text className="text-base text-ink-secondary">{meta.help}</Text>
          <Text className="text-sm text-ink-secondary">
            Reported {formatAge(report.created_at)}
            {confirmedLater ? ` · last confirmed ${formatAge(report.last_confirmed_at)}` : ""}
            {distanceM != null ? ` · ${formatDistance(distanceM)} from you` : ""}
            {report.location_accuracy_m != null ? ` · GPS ±${Math.round(report.location_accuracy_m)} m` : ""}
          </Text>
          {isOpen && report.effective_status === "active" ? (
            <Text className="text-xs text-ink-muted">
              Marked &quot;may have receded&quot; {formatUntil(report.expires_at)} unless someone confirms it.
            </Text>
          ) : null}
        </View>

        <ConfidenceCard
          level={report.confidence_level}
          score={report.confidence_score}
          reasons={report.confidence_reasons}
          status={report.effective_status}
        />

        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: "#E2E8F0" }}
            contentFit="cover"
            transition={200}
            accessibilityLabel="Photo attached to the report"
          />
        ) : null}

        {report.description ? (
          <View className="rounded-card bg-surface-raised p-4">
            <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Notes</Text>
            <Text className="mt-1 text-base leading-6 text-ink">{report.description}</Text>
          </View>
        ) : null}

        <View className="rounded-card bg-surface-raised p-4">
          <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Activity</Text>
          <Text className="mt-1 text-base text-ink">
            {report.confirm_count} confirmed still flooded · {report.clear_count} said it cleared
            {report.nearby_report_count > 0 ? ` · ${report.nearby_report_count} other nearby report${report.nearby_report_count === 1 ? "" : "s"}` : ""}
          </Text>
          {activity.length > 0 ? (
            <View className="mt-2 gap-1">
              {activity.map((a, i) => (
                <View key={`${a.created_at}-${i}`} className="flex-row items-center gap-2">
                  <Ionicons
                    name={a.kind === "confirm" ? "water" : "checkmark-circle-outline"}
                    size={16}
                    color={a.kind === "confirm" ? colors.severity.dangerous : colors.confidence.high}
                  />
                  <Text className="text-sm text-ink-secondary">
                    {a.kind === "confirm" ? "Someone confirmed it was still flooded" : "Someone said it had cleared"} ·{" "}
                    {formatAge(a.created_at)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="mt-1 text-sm text-ink-muted">No one has verified this report yet.</Text>
          )}
        </View>

        {is_mine ? (
          <View className="gap-2 rounded-card bg-surface-muted p-4">
            <Text className="text-sm text-ink-secondary">This is your report. You can&apos;t verify your own report, but you can close it.</Text>
            {isOpen ? (
              <Button
                title="Mark as no longer flooded"
                variant="secondary"
                onPress={confirmResolve}
                loading={resolve.isPending}
                disabled={!isOnline}
              />
            ) : null}
            {resolve.isError ? (
              <Text className="text-sm text-severity-impassable">Couldn&apos;t update the report. Try again.</Text>
            ) : null}
          </View>
        ) : (
          <VerifyActions
            reportId={report.id}
            reportLat={report.lat}
            reportLng={report.lng}
            status={report.effective_status}
            myVerification={my_verification}
          />
        )}
      </ScrollView>
    </View>
  );
}
