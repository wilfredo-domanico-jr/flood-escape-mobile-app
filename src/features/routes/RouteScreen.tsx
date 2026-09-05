import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Camera, GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import { AppMap } from "@/components/map/AppMap";
import { PinMarker } from "@/components/map/PinMarker";
import { Button } from "@/components/ui/Button";
import { LocationPermissionCard } from "@/components/ui/PermissionGate";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { promptForRouteAlerts } from "@/features/notifications/promptForRouteAlerts";
import { boundsForPoints } from "@/lib/geo/mapCamera";
import { ReportCard } from "@/features/reports/ReportCard";
import { useLocation } from "@/hooks/useLocation";
import { useAppStore } from "@/store/useAppStore";

import { describeRouteError, type SavedRoute } from "./api";
import { RouteRiskCard } from "./RouteRiskCard";
import {
  useDeleteRoute,
  useRouteCheck,
  useSavedRouteRisk,
  useSavedRoutes,
  useSaveRoute,
  useToggleRouteNotify,
} from "./useRouteSafety";

function SavedRouteRow({ route, onCheck }: { route: SavedRoute; onCheck: () => void }) {
  const risk = useSavedRouteRisk(route);
  const del = useDeleteRoute();
  const toggle = useToggleRouteNotify();
  const level = risk.data?.risk.level;
  const tint = level === "high" ? colors.severity.impassable : level === "caution" ? colors.severity.caution : colors.confidence.high;

  return (
    <View className="gap-2 rounded-card bg-surface-raised p-3">
      <View className="flex-row items-center gap-3">
        <Ionicons
          name={level === "high" ? "warning" : level === "caution" ? "alert-circle" : "checkmark-circle"}
          size={22}
          color={risk.data ? tint : colors.inkMuted}
        />
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{route.name}</Text>
          <Text className="text-sm text-ink-secondary">
            {risk.isPending ? "Checking…" : risk.data ? risk.data.risk.headline : "Couldn't check"}
            {route.destination_label ? ` · to ${route.destination_label}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            Alert.alert("Remove this route?", route.name, [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => del.mutate(route.id) },
            ])
          }
          accessibilityRole="button"
          accessibilityLabel={`Remove ${route.name}`}
          className="h-10 w-10 items-center justify-center"
        >
          <Ionicons name="trash-outline" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Switch
            value={route.notify}
            onValueChange={(v) => toggle.mutate({ id: route.id, notify: v })}
            trackColor={{ true: colors.brand }}
            accessibilityLabel={`Alerts for ${route.name}`}
          />
          <Text className="text-sm text-ink-secondary">Alert me about this route</Text>
        </View>
        <Button title="View" variant="ghost" onPress={onCheck} />
      </View>
    </View>
  );
}

export function RouteScreen() {
  const router = useRouter();
  const isOnline = useAppStore((s) => s.isOnline);
  const { permission, fix, request } = useLocation();
  const { check, checking, error, result, risk, isStale } = useRouteCheck();
  const saved = useSavedRoutes();
  const save = useSaveRoute();
  const [destination, setDestination] = useState("");
  const [viewSaved, setViewSaved] = useState<SavedRoute | null>(null);
  const savedRisk = useSavedRouteRisk(viewSaved);

  const run = () => {
    if (!fix) return;
    void check({ origin: { lat: fix.lat, lng: fix.lng }, destination }).catch(() => {});
  };

  const promptSave = () => {
    if (!result) return;
    Alert.prompt?.(
      "Name this route",
      "e.g. Home to work",
      (name) => {
        if (!name?.trim()) return;
        save.mutate(
          {
            name: name.trim(),
            geometry: result.route.geometry,
            origin: "Current location",
            destination: result.route.destination.label,
          },
          { onSuccess: () => void promptForRouteAlerts(name.trim()) },
        );
      },
      "plain-text",
      `To ${result.route.destination.label}`.slice(0, 60),
    ) ??
      save.mutate(
        {
          name: `To ${result.route.destination.label}`.slice(0, 60),
          geometry: result.route.geometry,
          origin: "Current location",
          destination: result.route.destination.label,
        },
        { onSuccess: () => void promptForRouteAlerts(`To ${result.route.destination.label}`.slice(0, 60)) },
      );
  };

  const shown = viewSaved
    ? savedRisk.data
      ? { geometry: viewSaved.route_geojson, hits: savedRisk.data.hits, risk: savedRisk.data.risk, fetchedAt: new Date().toISOString(), stale: false, distanceM: null, durationS: null, destination: viewSaved.destination_label ?? viewSaved.name }
      : null
    : result && risk
      ? { geometry: result.route.geometry, hits: result.hits, risk, fetchedAt: result.fetched_at, stale: isStale, distanceM: result.route.distance_m, durationS: result.route.duration_s, destination: result.route.destination.label }
      : null;

  const points = shown?.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) ?? [];
  const bounds = boundsForPoints(points) ?? [120.9, 14.5, 121.1, 14.7];
  const riskColor = shown ? (shown.risk.level === "high" ? colors.severity.impassable : shown.risk.level === "caution" ? colors.severity.caution : colors.confidence.high) : colors.brand;

  return (
    <Screen>
      <Text className="text-3xl font-bold text-ink">Is my route safe?</Text>
      <Text className="mt-1 text-base text-ink-secondary">
        We check the driving route from your location against recent flood reports.
      </Text>

      <View className="mt-4 gap-3">
        {permission !== "granted" ? (
          <LocationPermissionCard
            permission={permission}
            onRequest={request}
            reason="Your current location is the starting point of the route."
          />
        ) : null}
        <TextField
          label="Destination"
          value={destination}
          onChangeText={setDestination}
          placeholder="e.g. SM Marikina, Katipunan Ave, Barangay Tumana"
          returnKeyType="search"
          onSubmitEditing={run}
          autoCapitalize="words"
        />
        <Button
          title={checking ? "Checking…" : "Check route"}
          onPress={() => {
            setViewSaved(null);
            run();
          }}
          loading={checking}
          disabled={!fix || destination.trim().length < 2 || !isOnline}
        />
        {!isOnline ? <Text className="text-sm text-ink-muted">You&apos;re offline. The last result, if any, is shown below.</Text> : null}
        {error ? <Text className="text-sm text-severity-impassable">{describeRouteError(error.code)}</Text> : null}
      </View>

      {shown ? (
        <View className="mt-5 gap-3">
          {viewSaved ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{viewSaved.name}</Text>
              <Button title="Close" variant="ghost" onPress={() => setViewSaved(null)} />
            </View>
          ) : null}
          <RouteRiskCard risk={shown.risk} fetchedAt={shown.fetchedAt} stale={shown.stale} distanceM={shown.distanceM} durationS={shown.durationS} />
          <View className="overflow-hidden rounded-card" style={{ height: 240 }}>
            <AppMap style={{ flex: 1 }} interactive={false} accessibilityLabel="Map of the route and nearby flood reports">
              <Camera bounds={bounds} padding={{ top: 24, right: 24, bottom: 24, left: 24 }} />
              {shown.geometry.coordinates.length > 1 ? (
                <GeoJSONSource id="route" data={{ type: "Feature", properties: {}, geometry: shown.geometry }}>
                  <Layer
                    id="route-line"
                    type="line"
                    paint={{ "line-color": riskColor, "line-width": 5 }}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                  />
                </GeoJSONSource>
              ) : null}
              {points.length > 0 ? <PinMarker at={points[0]} color={colors.brand} accessibilityLabel="Start" /> : null}
              {points.length > 1 ? (
                <PinMarker at={points[points.length - 1]} color={colors.ink} accessibilityLabel={shown.destination} />
              ) : null}
              {[...shown.risk.onRoute, ...shown.risk.near].map((h) => {
                const full = shown.hits.find((x) => x.id === h.id);
                return full ? (
                  <PinMarker key={h.id} at={{ lat: full.lat, lng: full.lng }} color={SEVERITY_META[full.severity].color} size={28} />
                ) : null;
              })}
            </AppMap>
          </View>
          {!viewSaved ? (
            <Button title="Save this route for alerts" variant="secondary" onPress={promptSave} loading={save.isPending} />
          ) : null}
          {save.isError ? <Text className="text-sm text-severity-impassable">Couldn&apos;t save the route.</Text> : null}
          {[...shown.risk.onRoute, ...shown.risk.near].length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Reports along the way</Text>
              {[...shown.risk.onRoute, ...shown.risk.near].map((h) => {
                const full = shown.hits.find((x) => x.id === h.id);
                return full ? (
                  <ReportCard key={h.id} report={full} distanceM={h.distance_m} onPress={() => router.push({ pathname: "/report/[id]", params: { id: h.id } })} />
                ) : null;
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="mt-8 gap-2">
        <Text className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Saved routes</Text>
        {saved.data && saved.data.length > 0 ? (
          saved.data.map((r) => <SavedRouteRow key={r.id} route={r} onCheck={() => setViewSaved(r)} />)
        ) : (
          <Text className="text-sm text-ink-secondary">
            Save a route to check it in one tap and get alerts when flooding is reported along it.
          </Text>
        )}
      </View>
    </Screen>
  );
}
