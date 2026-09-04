import type { LatLng } from "./distance";

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function regionToBbox(region: Region): Bbox {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}

export function bboxCenter(b: Bbox): LatLng {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

/** Shrinks an oversized bbox around its center so a zoomed-out map never queries a whole country. */
export function clampBbox(b: Bbox, maxSpanDeg: number): Bbox {
  const c = bboxCenter(b);
  const latSpan = Math.min(b.maxLat - b.minLat, maxSpanDeg);
  const lngSpan = Math.min(b.maxLng - b.minLng, maxSpanDeg);
  return {
    minLat: c.lat - latSpan / 2,
    maxLat: c.lat + latSpan / 2,
    minLng: c.lng - lngSpan / 2,
    maxLng: c.lng + lngSpan / 2,
  };
}

/** Grows a bbox by a factor (1 = unchanged, 1.5 = 50% larger) to prefetch a margin around the view. */
export function expandBbox(b: Bbox, factor: number): Bbox {
  const c = bboxCenter(b);
  const latHalf = ((b.maxLat - b.minLat) / 2) * factor;
  const lngHalf = ((b.maxLng - b.minLng) / 2) * factor;
  return { minLat: c.lat - latHalf, maxLat: c.lat + latHalf, minLng: c.lng - lngHalf, maxLng: c.lng + lngHalf };
}

/** Rounds edges outward to a grid so small pans reuse the same query key. */
export function snapBbox(b: Bbox, stepDeg: number): Bbox {
  const down = (v: number) => Math.floor(v / stepDeg) * stepDeg;
  const up = (v: number) => Math.ceil(v / stepDeg) * stepDeg;
  const round = (v: number) => Number(v.toFixed(6));
  return { minLat: round(down(b.minLat)), maxLat: round(up(b.maxLat)), minLng: round(down(b.minLng)), maxLng: round(up(b.maxLng)) };
}

export function bboxContains(b: Bbox, p: LatLng): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

export function bboxKey(b: Bbox): string {
  return [b.minLat, b.minLng, b.maxLat, b.maxLng].map((v) => v.toFixed(4)).join(",");
}
