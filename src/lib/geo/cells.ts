import { GEO_CELL_DEG } from "@/constants/thresholds";

import type { Bbox } from "./bbox";

/**
 * Cell id for a coordinate. Must match `geo_cell_for()` in SQL:
 * floor(lat / 0.05) * 0.05 formatted with two decimals, then "_", then the same for lng.
 */
export function cellId(lat: number, lng: number, cellDeg = GEO_CELL_DEG): string {
  return `${edge(lat, cellDeg)}_${edge(lng, cellDeg)}`;
}

function edge(value: number, cellDeg: number): string {
  // Multiply by 100 and round to kill floating error before formatting.
  const floored = Math.floor(value / cellDeg + 1e-9) * cellDeg;
  return (Math.round(floored * 100) / 100).toFixed(2);
}

/** All cell ids overlapping a bbox, row-major. Returns [] if the bbox would need more than `max`. */
export function cellsForBbox(b: Bbox, max: number, cellDeg = GEO_CELL_DEG): string[] {
  const latStart = Math.floor(b.minLat / cellDeg + 1e-9);
  const latEnd = Math.floor(b.maxLat / cellDeg - 1e-9);
  const lngStart = Math.floor(b.minLng / cellDeg + 1e-9);
  const lngEnd = Math.floor(b.maxLng / cellDeg - 1e-9);
  const count = (latEnd - latStart + 1) * (lngEnd - lngStart + 1);
  if (count > max || count <= 0) return [];

  const cells: string[] = [];
  for (let i = latStart; i <= latEnd; i++) {
    for (let j = lngStart; j <= lngEnd; j++) {
      cells.push(cellId(i * cellDeg + cellDeg / 2, j * cellDeg + cellDeg / 2, cellDeg));
    }
  }
  return cells;
}
