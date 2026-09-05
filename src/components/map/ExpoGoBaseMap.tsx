import Constants, { ExecutionEnvironment } from "expo-constants";
import { type DimensionValue, Platform, Text, View } from "react-native";
import { UrlTile } from "react-native-maps";

/**
 * Expo Go on Android cannot authorize Google Maps with recent react-native-maps builds
 * (https://github.com/react-native-maps/react-native-maps/issues/5888), so the base map
 * draws as a flat grey area while markers and overlays still render. During development we
 * paint OpenStreetMap tiles on top so the map is usable. Inert in development and
 * production builds, and on iOS (Apple Maps needs no key).
 */
export const USE_OSM_FALLBACK_TILES =
  __DEV__ && Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Place inside a <MapView>. Renders nothing outside Expo Go on Android. */
export function ExpoGoBaseTiles() {
  if (!USE_OSM_FALLBACK_TILES) return null;
  return <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} zIndex={-1} />;
}

/** OSM's tile policy requires attribution. Place as a sibling of the <MapView> inside its container. */
export function ExpoGoTileAttribution({ bottom = 4 }: { bottom?: DimensionValue }) {
  if (!USE_OSM_FALLBACK_TILES) return null;
  return (
    <View pointerEvents="none" className="absolute left-1 rounded bg-white/80 px-1" style={{ bottom }}>
      <Text className="text-[10px] text-ink-muted">© OpenStreetMap contributors · dev tiles</Text>
    </View>
  );
}
