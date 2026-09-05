import type { Bbox } from "./bbox";
import type { LatLng } from "./distance";

/** MapLibre bounds order: [west, south, east, north]. */
export type LngLatBounds = [west: number, south: number, east: number, north: number];
export type LngLat = [lng: number, lat: number];

const TILE_PX = 512;
const ASSUMED_MAP_WIDTH_PX = 400;

/**
 * Web-Mercator zoom at which `spanDeg` degrees of longitude fill a phone-width map.
 * Approximate on purpose: it replaces the old latitudeDelta/longitudeDelta regions with a zoom level.
 */
export function zoomForSpan(spanDeg: number, mapWidthPx = ASSUMED_MAP_WIDTH_PX): number {
  const span = Math.max(spanDeg, 1e-6);
  return Math.log2((360 * mapWidthPx) / (TILE_PX * span));
}

export function toLngLat(p: LatLng): LngLat {
  return [p.lng, p.lat];
}

export function boundsToBbox(b: LngLatBounds): Bbox {
  return { minLng: b[0], minLat: b[1], maxLng: b[2], maxLat: b[3] };
}

export function bboxToBounds(b: Bbox): LngLatBounds {
  return [b.minLng, b.minLat, b.maxLng, b.maxLat];
}

/** Bounds enclosing all points, grown by `factor` (1 = tight). Null for an empty list. */
export function boundsForPoints(points: LatLng[], factor = 1.2, minSpanDeg = 0.005): LngLatBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  const halfLat = Math.max((maxLat - minLat) / 2, minSpanDeg / 2) * factor;
  const halfLng = Math.max((maxLng - minLng) / 2, minSpanDeg / 2) * factor;
  return [cLng - halfLng, cLat - halfLat, cLng + halfLng, cLat + halfLat];
}

const M_PER_DEG_LAT = 111_320;

/** GeoJSON polygon approximating a circle of `radiusM` meters; used for GPS accuracy rings. */
export function circlePolygon(center: LatLng, radiusM: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)]);
  }
  ring.push(ring[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
