import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";

import { LOCATION_WATCH_DISTANCE_M, LOCATION_WATCH_INTERVAL_MS } from "@/constants/thresholds";

export type LocationPermission = "unknown" | "granted" | "denied" | "blocked";

export type Fix = {
  lat: number;
  lng: number;
  /** Radius of uncertainty in meters, if the platform reports one. */
  accuracyM: number | null;
  timestamp: number;
  /** True when this came from the OS cache rather than a fresh fix. */
  isLastKnown: boolean;
};

type Options = {
  /** Keep a foreground watch running while mounted (map screen). */
  watch?: boolean;
};

function toFix(pos: Location.LocationObject, isLastKnown: boolean): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? null,
    timestamp: pos.timestamp,
    isLastKnown,
  };
}

/**
 * Foreground location with explicit permission states and a fast last-known fallback.
 * Background location is deliberately not used (privacy, battery, Expo Go).
 */
export function useLocation({ watch = false }: Options = {}) {
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const readPermission = useCallback(async () => {
    const status = await Location.getForegroundPermissionsAsync();
    const next: LocationPermission = status.granted
      ? "granted"
      : status.canAskAgain
        ? "denied"
        : "blocked";
    setPermission(next);
    return next;
  }, []);

  const request = useCallback(async () => {
    const current = await readPermission();
    if (current === "granted") return "granted" as const;
    if (current === "blocked") {
      if (Platform.OS !== "web") await Linking.openSettings();
      return "blocked" as const;
    }
    const res = await Location.requestForegroundPermissionsAsync();
    return readPermission().then(() => (res.granted ? ("granted" as const) : ("denied" as const)));
  }, [readPermission]);

  /** Fresh fix, falling back to the last known position if the GPS is slow or unavailable. */
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      if (last) setFix((prev) => prev ?? toFix(last, true));
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const f = toFix(fresh, false);
      setFix(f);
      return f;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Location unavailable");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Permission lives in the OS; read it asynchronously and again whenever the app regains focus.
    void Promise.resolve().then(readPermission);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void readPermission();
    });
    return () => sub.remove();
  }, [readPermission]);

  useEffect(() => {
    if (permission !== "granted") return;
    void Promise.resolve().then(refresh);
    if (!watch) return;

    let cancelled = false;
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: LOCATION_WATCH_DISTANCE_M,
        timeInterval: LOCATION_WATCH_INTERVAL_MS,
      },
      (pos) => setFix(toFix(pos, false)),
    ).then((sub) => {
      if (cancelled) sub.remove();
      else watcher.current = sub;
    });

    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [permission, watch, refresh]);

  return { permission, fix, error, busy, request, refresh };
}
