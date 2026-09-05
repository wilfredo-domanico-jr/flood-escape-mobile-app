import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";

import type { LatLng } from "@/lib/geo/distance";
import { circlePolygon } from "@/lib/geo/mapCamera";

type Props = { id?: string; center: LatLng; radiusM: number };

/** Translucent ring showing GPS uncertainty around a fix. */
export function AccuracyCircle({ id = "accuracy", center, radiusM }: Props) {
  const feature = useMemo(() => circlePolygon(center, radiusM), [center, radiusM]);
  return (
    <GeoJSONSource id={id} data={feature}>
      <Layer id={`${id}-fill`} type="fill" paint={{ "fill-color": "rgba(14,116,144,0.12)" }} />
      <Layer id={`${id}-line`} type="line" paint={{ "line-color": "rgba(14,116,144,0.4)", "line-width": 1.5 }} />
    </GeoJSONSource>
  );
}
