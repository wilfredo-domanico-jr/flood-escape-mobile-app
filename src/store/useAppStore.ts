import { create } from "zustand";

export type Viewport = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type SyncStatus = "idle" | "syncing" | "pending" | "failed";

type AppState = {
  /** Last known connectivity; updated by the network hook. */
  isOnline: boolean;
  /** True on Wi-Fi/ethernet; used by the "photos on Wi-Fi only" preference. */
  isWifi: boolean;
  /** Current map viewport (rounded), used for viewport-scoped queries and realtime cells. */
  viewport: Viewport | null;
  /** Outbox status summary for the offline banner. */
  syncStatus: SyncStatus;
  pendingCount: number;
  setOnline: (online: boolean) => void;
  setWifi: (wifi: boolean) => void;
  setViewport: (viewport: Viewport | null) => void;
  setSync: (status: SyncStatus, pendingCount: number) => void;
};

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isWifi: false,
  viewport: null,
  syncStatus: "idle",
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setWifi: (isWifi) => set({ isWifi }),
  setViewport: (viewport) => set({ viewport }),
  setSync: (syncStatus, pendingCount) => set({ syncStatus, pendingCount }),
}));
