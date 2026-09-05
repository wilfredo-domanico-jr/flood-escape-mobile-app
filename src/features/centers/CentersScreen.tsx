import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { ExpoGoBaseTiles, ExpoGoTileAttribution } from "@/components/map/ExpoGoBaseMap";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocationPermissionCard } from "@/components/ui/PermissionGate";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/theme";
import { DEFAULT_REGION } from "@/constants/thresholds";
import { useLocation } from "@/hooks/useLocation";
import { formatDistance } from "@/lib/geo/distance";
import { formatAge } from "@/lib/format/relativeTime";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useAppStore } from "@/store/useAppStore";

import { type CenterKind, fetchNearestCenters, type NearbyCenter, openDirections } from "./api";

type IconName = ComponentProps<typeof Ionicons>["name"];

const KIND_META: Record<CenterKind, { label: string; plural: string; icon: IconName; color: string }> = {
  evacuation: { label: "Evacuation center", plural: "Evacuation", icon: "home-outline", color: colors.brand },
  hospital: { label: "Hospital", plural: "Hospitals", icon: "medkit-outline", color: colors.severity.impassable },
  fire: { label: "Fire station", plural: "Fire", icon: "flame-outline", color: colors.severity.dangerous },
  police: { label: "Police station", plural: "Police", icon: "shield-outline", color: colors.ink },
};

const ALL_KINDS: CenterKind[] = ["evacuation", "hospital", "fire", "police"];

function CenterCard({ c }: { c: NearbyCenter }) {
  const meta = KIND_META[c.kind];
  const sample = /sample/i.test(c.source);
  return (
    <View className="gap-2 rounded-card bg-surface-raised p-3">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: meta.color }}>
          <Ionicons name={meta.icon} size={20} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{c.name}</Text>
          <Text className="text-sm text-ink-secondary">
            {meta.label} · {formatDistance(c.distance_m)} away
          </Text>
          {c.address || c.city ? (
            <Text className="text-sm text-ink-muted">{[c.address, c.city].filter(Boolean).join(", ")}</Text>
          ) : null}
          <Text className="mt-1 text-xs text-ink-muted">
            {c.capacity != null ? `Capacity ${c.capacity}` : "Capacity unknown"}
            {c.source_updated_at ? ` · data from ${formatAge(c.source_updated_at)}` : ""}
            {sample ? " · sample data, verify before relying on it" : ""}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <Button title="Directions" className="flex-1" onPress={() => void openDirections(c)} />
        {c.contact ? (
          <Button title="Call" variant="secondary" className="flex-1" onPress={() => void Linking.openURL(`tel:${c.contact}`)} />
        ) : null}
      </View>
    </View>
  );
}

export function CentersScreen() {
  const isOnline = useAppStore((s) => s.isOnline);
  const { permission, fix, request } = useLocation();
  const [kinds, setKinds] = useState<CenterKind[]>(ALL_KINDS);

  const origin = fix ? { lat: fix.lat, lng: fix.lng } : { lat: DEFAULT_REGION.latitude, lng: DEFAULT_REGION.longitude };
  const key = `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
  const query = useQuery({
    queryKey: ["centers", key, kinds.slice().sort().join(",")],
    queryFn: () => fetchNearestCenters(origin.lat, origin.lng, kinds.length === ALL_KINDS.length ? null : kinds, 20),
    enabled: isSupabaseConfigured && kinds.length > 0,
    staleTime: 10 * 60_000,
  });

  const toggle = (k: CenterKind) =>
    setKinds((prev) => (prev.includes(k) ? (prev.length === 1 ? prev : prev.filter((x) => x !== k)) : [...prev, k]));

  const shown = (query.data ?? []).slice(0, 12);

  return (
    <Screen>
      <Text className="text-3xl font-bold text-ink">Safe places nearby</Text>
      <Text className="mt-1 text-base text-ink-secondary">
        Evacuation centers, hospitals, fire and police stations closest to you.
      </Text>

      {permission !== "granted" ? (
        <View className="mt-3">
          <LocationPermissionCard
            permission={permission}
            onRequest={request}
            reason="Distances are measured from your location. Without it we show Metro Manila in general."
            compact
          />
        </View>
      ) : null}

      <View className="mt-4 flex-row flex-wrap gap-2">
        {ALL_KINDS.map((k) => {
          const on = kinds.includes(k);
          const meta = KIND_META[k];
          return (
            <Pressable
              key={k}
              onPress={() => toggle(k)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className="flex-row items-center gap-1.5 rounded-pill border px-3 py-1.5"
              style={{ borderColor: on ? meta.color : "#E2E8F0", backgroundColor: on ? `${meta.color}1A` : "#FFFFFF" }}
            >
              <Ionicons name={meta.icon} size={14} color={on ? meta.color : colors.inkMuted} />
              <Text className="text-sm font-semibold" style={{ color: on ? colors.ink : colors.inkMuted }}>
                {meta.plural}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length > 0 ? (
        <View className="mt-4 overflow-hidden rounded-card" style={{ height: 200 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{ latitude: origin.lat, longitude: origin.lng, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
            showsUserLocation={permission === "granted"}
            toolbarEnabled={false}
            accessibilityLabel="Map of nearby facilities"
          >
            <ExpoGoBaseTiles />
            {shown.map((c) => (
              <Marker key={c.id} coordinate={{ latitude: c.lat, longitude: c.lng }} title={c.name} pinColor={KIND_META[c.kind].color} />
            ))}
          </MapView>
          <ExpoGoTileAttribution />
        </View>
      ) : null}

      <View className="mt-4 gap-2">
        {query.isPending && isSupabaseConfigured ? (
          <Text className="text-sm text-ink-secondary">Finding places near you…</Text>
        ) : query.isError && shown.length === 0 ? (
          <EmptyState
            icon={isOnline ? "alert-circle-outline" : "cloud-offline-outline"}
            title={isOnline ? "Couldn't load facilities" : "You're offline"}
            body={isOnline ? "The server didn't respond. Pull down to try again." : "Facilities you've seen before will appear here once cached."}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon="business-outline" title="No facilities listed near here" body="Try enabling more categories." />
        ) : (
          shown.map((c) => <CenterCard key={c.id} c={c} />)
        )}
      </View>

      <Text className="mt-6 text-xs leading-4 text-ink-muted">
        Availability and capacity are shown only when the data source provides them. In an emergency call 911.
      </Text>
    </Screen>
  );
}
