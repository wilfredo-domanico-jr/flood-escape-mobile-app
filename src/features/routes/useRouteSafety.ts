import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { classifyRouteRisk } from "@/lib/geo/routeRisk";
import { useAppStore } from "@/store/useAppStore";

import {
  assessSavedRoute,
  checkRoute,
  deleteSavedRoute,
  type LatLng,
  listSavedRoutes,
  RouteError,
  type RouteCheckResult,
  type SavedRoute,
  saveRoute,
  setRouteNotify,
} from "./api";

const LAST_RESULT_KEY = ["route", "last"] as const;

/** Runs a route check and keeps the last result in the (persisted) query cache for offline viewing. */
export function useRouteCheck() {
  const queryClient = useQueryClient();
  const last = useQuery<RouteCheckResult | null>({
    queryKey: LAST_RESULT_KEY,
    queryFn: async () => null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const mutation = useMutation({
    mutationFn: async ({ origin, destination }: { origin: LatLng; destination: string }) => {
      if (!useAppStore.getState().isOnline) throw new RouteError("offline");
      return checkRoute(origin, destination);
    },
    onSuccess: (result) => queryClient.setQueryData(LAST_RESULT_KEY, result),
  });

  const result = mutation.data ?? last.data ?? null;
  const risk = useMemo(() => (result ? classifyRouteRisk(result.hits) : null), [result]);
  const isStale = Boolean(result && !mutation.data);

  return { check: mutation.mutateAsync, checking: mutation.isPending, error: mutation.error as RouteError | null, result, risk, isStale };
}

export const savedRoutesKey = ["me", "routes"] as const;

export function useSavedRoutes() {
  return useQuery({ queryKey: savedRoutesKey, queryFn: listSavedRoutes, staleTime: 60_000 });
}

export function useSaveRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; geometry: RouteCheckResult["route"]["geometry"]; origin: string; destination: string }) =>
      saveRoute(args.name, args.geometry, args.origin, args.destination),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: savedRoutesKey }),
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedRoute,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: savedRoutesKey }),
  });
}

export function useToggleRouteNotify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notify }: { id: string; notify: boolean }) => setRouteNotify(id, notify),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: savedRoutesKey }),
  });
}

/** Risk for each saved route, refreshed on demand (cheap: one PostGIS query per route). */
export function useSavedRouteRisk(route: SavedRoute | null) {
  return useQuery({
    queryKey: ["route", "saved-risk", route?.id ?? "none", route?.updated_at ?? ""],
    enabled: Boolean(route),
    staleTime: 30_000,
    queryFn: async () => {
      const hits = await assessSavedRoute(route!.route_geojson);
      return { hits, risk: classifyRouteRisk(hits) };
    },
  });
}
