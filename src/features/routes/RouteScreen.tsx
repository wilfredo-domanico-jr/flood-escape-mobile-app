import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { Button } from "@/components/ui/Button";
import { LocationPermissionCard } from "@/components/ui/PermissionGate";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
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
        save.mutate({
          name: name.trim(),
          geometry: result.route.geometry,
          origin: "Current location",
          destination: result.route.destination.label,
        });
      },
      "plain-text",
      `To ${result.route.destination.label}`.slice(0, 60),
    ) ??
      save.mutate({
        name: `To ${result.route.destination.label}`.slice(0, 60),
        geometry: result.route.geometry,
        origin: "Current location",
        destination: result.route.destination.label,
      });
  };

  const shown = viewSaved
    ? savedRisk.data
      ? { geometry: viewSaved.route_geojson, hits: savedRisk.data.hits, risk: savedRisk.data.risk, fetchedAt: new Date().toISOString(), stale: false, distanceM: null, durationS: null, destination: viewSaved.destination_label ?? viewSaved.name }
      : null
    : result && risk
      ? { geometry: result.route.geometry, hits: result.hits, risk, fetchedAt: result.fetched_at, stale: isStale, distanceM: result.route.distance_m, durationS: result.route.duration_s, destination: result.route.destination.label }
      : null;

  const coords = shown?.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })) ?? [];
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
            <MapView
              style={{ flex: 1 }}
              initialRegion={regionFor(coords)}
              region={regionFor(coords)}
              scrollEnabled={false}
              toolbarEnabled={false}
              accessibilityLabel="Map of the route and nearby flood reports"
            >
              <Polyline coordinates={coords} strokeColor={riskColor} strokeWidth={5} />
              {coords.length > 0 ? <Marker coordinate={coords[0]} pinColor={colors.brand} title="Start" /> : null}
              {coords.length > 1 ? <Marker coordinate={coords[coords.length - 1]} pinColor={colors.ink} title={shown.destination} /> : null}
              {[...shown.risk.onRoute, ...shown.risk.near].map((h) => {
                const full = shown.hits.find((x) => x.id === h.id);
                return full ? (
                  <Marker key={h.id} coordinate={{ latitude: full.lat, longitude: full.lng }} pinColor={SEVERITY_META[full.severity].color} />
                ) : null;
              })}
            </MapView>
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

function regionFor(coords: { latitude: number; longitude: number }[]) {
  if (coords.length === 0) return { latitude: 14.5995, longitude: 120.9842, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
    minLng = Math.min(minLng, c.longitude);
    maxLng = Math.max(maxLng, c.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.4),
  };
}
