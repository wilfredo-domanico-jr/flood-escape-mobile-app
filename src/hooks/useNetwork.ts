import { NetworkStateType, useNetworkState } from "expo-network";
import { useEffect } from "react";

import { useAppStore } from "@/store/useAppStore";

/** Mirrors device connectivity into the app store so non-hook code (outbox, auth) can read it. */
export function useNetworkSync(): boolean {
  const state = useNetworkState();
  // `isInternetReachable` can be null while unknown; treat unknown as online to avoid false banners.
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  const isWifi = state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET;
  const setOnline = useAppStore((s) => s.setOnline);
  const setWifi = useAppStore((s) => s.setWifi);

  useEffect(() => {
    setOnline(online);
    setWifi(isWifi);
  }, [online, isWifi, setOnline, setWifi]);

  return online;
}
