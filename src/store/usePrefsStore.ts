import Storage from "expo-sqlite/kv-store";
import { create } from "zustand";

/** User preferences that must survive restarts. Persisted to SQLite kv-store. */
export type Prefs = {
  /** Only upload report photos over Wi-Fi (reports themselves always go out). */
  wifiOnlyPhotos: boolean;
  /** Snap my report locations to ~100 m before sending. */
  blurMyLocation: boolean;
};

const DEFAULTS: Prefs = { wifiOnlyPhotos: false, blurMyLocation: false };
const KEY = "prefs.v1";

type PrefsState = Prefs & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => Promise<void>;
};

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await Storage.getItem(KEY);
      if (raw) set({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      // Defaults are fine.
    } finally {
      set({ hydrated: true });
    }
  },
  set: async (key, value) => {
    set({ [key]: value } as Partial<Prefs>);
    const { wifiOnlyPhotos, blurMyLocation } = get();
    try {
      await Storage.setItem(KEY, JSON.stringify({ wifiOnlyPhotos, blurMyLocation }));
    } catch {
      // Non-fatal; the preference still applies for this session.
    }
  },
}));

/** Rounds to ~100 m so a report does not pinpoint a doorstep. */
export function blurCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
