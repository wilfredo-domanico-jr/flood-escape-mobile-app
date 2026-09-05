import type BottomSheet from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Camera, type CameraRef, UserLocation, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type NativeSyntheticEvent, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccuracyCircle } from "@/components/map/AccuracyCircle";
import { AppMap } from "@/components/map/AppMap";
import { LocationPermissionCard } from "@/components/ui/PermissionGate";
import { colors } from "@/constants/theme";
import { DEFAULT_REGION, DEFAULT_ZOOM, POOR_ACCURACY_M, RECENTER_THRESHOLD_M, USER_ZOOM } from "@/constants/thresholds";
import { pendingToPublicReport, usePendingReports } from "@/features/offline/usePendingReports";
import { useLocation } from "@/hooks/useLocation";
import { type Bbox, regionToBbox } from "@/lib/geo/bbox";
import { haversineDistanceM, type LatLng } from "@/lib/geo/distance";
import { boundsToBbox } from "@/lib/geo/mapCamera";
import { useAppStore } from "@/store/useAppStore";

import { RoundButton, StatusChip } from "./MapControls";
import { NearbyReportsSheet, type SheetItem } from "./NearbyReportsSheet";
import { ReportMarker } from "./ReportMarker";
import { useReportsInViewport } from "./useReportsInViewport";
import { useReportsRealtime } from "./useReportsRealtime";

const DEFAULT_CENTER: LatLng = { lat: DEFAULT_REGION.latitude, lng: DEFAULT_REGION.longitude };

export function HomeMap() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraRef>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const { permission, fix, request } = useLocation({ watch: true });
  const isOnline = useAppStore((s) => s.isOnline);
  const setViewport = useAppStore((s) => s.setViewport);

  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [viewport, setLocalViewport] = useState<Bbox | null>(regionToBbox(DEFAULT_REGION));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [focused, setFocused] = useState(false);
  const centeredOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const { reports, isFetching, dataUpdatedAt, isError, bbox: queryBbox } = useReportsInViewport(viewport);
  const realtime = useReportsRealtime(queryBbox, focused);
  const pending = usePendingReports();
  const pendingReports = useMemo(
    () => pending.filter((p) => p.kind === "report" && p.status !== "failed").map(pendingToPublicReport),
    [pending],
  );

  // First fix: jump to the user once, then let them pan freely.
  useEffect(() => {
    if (!fix || centeredOnce.current) return;
    centeredOnce.current = true;
    cameraRef.current?.easeTo({ center: [fix.lng, fix.lat], zoom: USER_ZOOM, duration: 600 });
  }, [fix]);

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { bounds, center: c, userInteraction } = e.nativeEvent;
      const bbox = boundsToBbox(bounds);
      setCenter({ lng: c[0], lat: c[1] });
      setLocalViewport(bbox);
      setViewport(bbox);
      if (userInteraction) setFollowUser(false);
    },
    [setViewport],
  );

  const recenter = useCallback(async () => {
    if (permission !== "granted") {
      await request();
      return;
    }
    if (!fix) return;
    setFollowUser(true);
    cameraRef.current?.easeTo({ center: [fix.lng, fix.lat], zoom: USER_ZOOM, duration: 400 });
  }, [permission, fix, request]);

  const openReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.push({ pathname: "/report/[id]", params: { id } });
    },
    [router],
  );

  // Distances are measured from the user when known, else from the map center.
  const originLat = fix ? fix.lat : center.lat;
  const originLng = fix ? fix.lng : center.lng;
  const items = useMemo<SheetItem[]>(() => {
    const origin = { lat: originLat, lng: originLng };
    const queued: SheetItem[] = pendingReports.map((report) => ({
      report,
      distanceM: haversineDistanceM(origin, { lat: report.lat, lng: report.lng }),
      pending: true,
    }));
    const synced = reports
      .map((report) => ({
        report,
        distanceM: haversineDistanceM(origin, { lat: report.lat, lng: report.lng }),
      }))
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    return [...queued, ...synced];
  }, [reports, pendingReports, originLat, originLng]);

  const userFarFromView =
    fix && !followUser && haversineDistanceM({ lat: fix.lat, lng: fix.lng }, center) > RECENTER_THRESHOLD_M;

  return (
    <View className="flex-1 bg-surface">
      <AppMap
        style={{ flex: 1 }}
        attributionBottom="18%"
        onRegionDidChange={onRegionDidChange}
        onPress={() => setSelectedId(null)}
        accessibilityLabel="Map of nearby flood reports"
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat], zoom: DEFAULT_ZOOM }}
        />
        {permission === "granted" ? <UserLocation /> : null}
        {fix && fix.accuracyM != null && fix.accuracyM > POOR_ACCURACY_M ? (
          <AccuracyCircle center={{ lat: fix.lat, lng: fix.lng }} radiusM={fix.accuracyM} />
        ) : null}
        {reports.map((r) => (
          <ReportMarker key={r.id} report={r} selected={r.id === selectedId} onPress={openReport} />
        ))}
        {pendingReports.map((r) => (
          <ReportMarker key={r.id} report={r} selected={false} onPress={() => {}} pending />
        ))}
      </AppMap>

      {/* Top overlays */}
      <View pointerEvents="box-none" className="absolute left-0 right-0 px-4" style={{ top: insets.top + 8 }}>
        <View className="flex-row flex-wrap items-center gap-2">
          {!isOnline ? <StatusChip icon="cloud-offline-outline" label="Offline" color={colors.inkMuted} /> : null}
          {isOnline && realtime.state === "live" ? (
            <StatusChip icon="radio-outline" label="Live" color={colors.confidence.high} />
          ) : null}
          {isOnline && realtime.state === "paused" ? (
            <StatusChip icon="pause-circle-outline" label="Live updates paused" color={colors.inkMuted} />
          ) : null}
          {isOnline && realtime.state === "too-wide" ? (
            <StatusChip icon="search-outline" label="Zoom in for live updates" color={colors.inkMuted} />
          ) : null}
          {isError && isOnline ? (
            <StatusChip icon="alert-circle-outline" label="Server unreachable" color={colors.severity.caution} />
          ) : null}
          {isFetching && reports.length > 0 ? (
            <StatusChip icon="refresh-outline" label="Updating" color={colors.brand} />
          ) : null}
          {fix?.isLastKnown ? (
            <StatusChip icon="time-outline" label="Last known location" color={colors.inkMuted} />
          ) : null}
        </View>
        {permission !== "granted" ? (
          <View className="mt-2">
            <LocationPermissionCard
              permission={permission}
              onRequest={request}
              reason="Flood Escape uses your location only while the app is open, to show reports near you and to place your own reports."
              compact
            />
          </View>
        ) : null}
      </View>

      {/* Right-side controls */}
      <View pointerEvents="box-none" className="absolute right-4 gap-3" style={{ top: insets.top + 64 }}>
        <RoundButton icon="locate" label="Center on my location" onPress={recenter} active={followUser} />
      </View>

      {userFarFromView ? (
        <View pointerEvents="box-none" className="absolute left-0 right-0 items-center" style={{ top: insets.top + 64 }}>
          <Pressable
            onPress={recenter}
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-pill bg-surface-raised px-4 py-2 shadow"
            style={{ elevation: 3 }}
          >
            <Ionicons name="navigate-outline" size={16} color={colors.brand} />
            <Text className="text-sm font-semibold text-ink">Back to my location</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Report FAB sits above the sheet handle */}
      <View pointerEvents="box-none" className="absolute right-4" style={{ bottom: "18%" }}>
        <Pressable
          onPress={() => router.push("/report/new")}
          accessibilityRole="button"
          accessibilityLabel="Report flooding"
          className="flex-row items-center gap-2 rounded-pill bg-severity-impassable px-5 py-3.5 shadow-lg"
          style={{ elevation: 4 }}
        >
          <Ionicons name="water" size={20} color="#fff" />
          <Text className="text-base font-bold text-white">Report flooding</Text>
        </Pressable>
      </View>

      <NearbyReportsSheet
        ref={sheetRef}
        items={items}
        selectedId={selectedId}
        loading={isFetching && reports.length === 0}
        offline={!isOnline}
        lastUpdatedAt={dataUpdatedAt || null}
        onSelect={(id) => {
          if (!id.startsWith("pending:")) openReport(id);
        }}
      />
    </View>
  );
}
