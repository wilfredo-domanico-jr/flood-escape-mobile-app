import Ionicons from "@expo/vector-icons/Ionicons";
import { Marker, ViewAnnotation } from "@maplibre/maplibre-react-native";
import { View } from "react-native";

import type { LatLng } from "@/lib/geo/distance";

type PinProps = { color: string; size?: number };

/** A classic teardrop pin whose tip marks the exact coordinate. */
export function Pin({ color, size = 34 }: PinProps) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "flex-end" }}>
      <Ionicons name="location" size={size} color="#FFFFFF" style={{ position: "absolute", top: 0, transform: [{ scale: 1.12 }] }} />
      <Ionicons name="location" size={size} color={color} style={{ position: "absolute", top: 0 }} />
    </View>
  );
}

type MarkerProps = { at: LatLng; color: string; size?: number; accessibilityLabel?: string; onPress?: () => void };

/** Static pin anchored at its tip. */
export function PinMarker({ at, color, size, accessibilityLabel, onPress }: MarkerProps) {
  return (
    <Marker lngLat={[at.lng, at.lat]} anchor="bottom" onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <Pin color={color} size={size} />
    </Marker>
  );
}

type DraggableProps = { at: LatLng; color: string; onDragEnd: (p: LatLng) => void; accessibilityLabel?: string };

/** Pin the user can long-press and drag; the new tip position is reported on release. */
export function DraggablePinMarker({ at, color, onDragEnd, accessibilityLabel }: DraggableProps) {
  return (
    <ViewAnnotation
      id="draggable-pin"
      lngLat={[at.lng, at.lat]}
      anchor="bottom"
      draggable
      onDragEnd={(e) => onDragEnd({ lng: e.nativeEvent.lngLat[0], lat: e.nativeEvent.lngLat[1] })}
    >
      <View accessibilityLabel={accessibilityLabel}>
        <Pin color={color} size={40} />
      </View>
    </ViewAnnotation>
  );
}
