import { Map as MapLibreMap, type MapProps } from "@maplibre/maplibre-react-native";
import { type DimensionValue, Text, View, type ViewProps } from "react-native";

/**
 * OpenFreeMap serves OpenMapTiles-styled vector tiles built from OpenStreetMap, free and without
 * an API key. Attribution is required by both OpenFreeMap and OpenStreetMap, so it is rendered here
 * rather than left to each screen.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type Props = Omit<MapProps, "mapStyle" | "style"> & {
  /** Style for the wrapper; the map itself always fills it. */
  style?: ViewProps["style"];
  /** False for preview maps that should not respond to gestures. */
  interactive?: boolean;
  /** Where the attribution line sits, so it can clear bottom sheets. */
  attributionBottom?: DimensionValue;
};

export function AppMap({ style, interactive = true, attributionBottom = 4, children, ...props }: Props) {
  return (
    <View style={style}>
      <MapLibreMap
        style={{ flex: 1 }}
        mapStyle={MAP_STYLE_URL}
        attribution={false}
        logo={false}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        {...props}
      >
        {children}
      </MapLibreMap>
      <View pointerEvents="none" className="absolute left-1 rounded bg-white/80 px-1" style={{ bottom: attributionBottom }}>
        <Text className="text-[10px] text-ink-muted">© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors</Text>
      </View>
    </View>
  );
}
