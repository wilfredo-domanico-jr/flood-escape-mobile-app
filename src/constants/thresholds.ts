/**
 * Numbers that shape behaviour. Server-side equivalents live in supabase/migrations;
 * when you change one here, change it there too (and vice versa).
 */

/** Realtime grid cell size in degrees (about 5.5 km at Manila). Mirrors geo_cell_for() in SQL. */
export const GEO_CELL_DEG = 0.05;

/** Supabase Realtime `in.()` filters accept at most 100 values. */
export const MAX_REALTIME_CELLS = 100;

/** Largest viewport span we will query, in degrees. Wider views are clamped around the center. */
export const MAX_VIEWPORT_SPAN_DEG = 0.5;

/** Cap for markers fetched per viewport. */
export const VIEWPORT_REPORT_LIMIT = 200;

/** Radius for "nearby" lists. */
export const NEARBY_RADIUS_M = 2000;

/** GPS accuracy above which we warn the user and ask them to adjust the pin. */
export const POOR_ACCURACY_M = 50;

/** Distance a user must move before the "Search this area" affordance reappears. */
export const RECENTER_THRESHOLD_M = 500;

/** Foreground location watch settings while the map is open. */
export const LOCATION_WATCH_DISTANCE_M = 25;
export const LOCATION_WATCH_INTERVAL_MS = 10_000;

/** Default map center: Metro Manila. */
export const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

/** Map zoom levels (web-Mercator). */
export const DEFAULT_ZOOM = 11.2;
/** Zoom used when centering on the user. */
export const USER_ZOOM = 14;
/** Zoom for placing a report pin. */
export const PIN_ZOOM = 16;
/** Zoom for the small preview on report details. */
export const DETAIL_ZOOM = 15.5;
