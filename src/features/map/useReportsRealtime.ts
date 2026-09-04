import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { MAX_REALTIME_CELLS } from "@/constants/thresholds";
import { reportQueryKey } from "@/features/reports/useReport";
import type { Bbox } from "@/lib/geo/bbox";
import { cellsForBbox } from "@/lib/geo/cells";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { PublicReport } from "@/lib/supabase/database.types";
import { useAppStore } from "@/store/useAppStore";

import { applyRowToViewport, removeRowFromViewport } from "./realtimeCache";
import { reportsQueryKey } from "./useReportsInViewport";

export type RealtimeStatus =
  | { state: "off"; reason: "unfocused" | "offline" | "unconfigured" | "no-viewport" }
  | { state: "too-wide" }
  | { state: "connecting" }
  | { state: "live" }
  | { state: "paused" };

const RESUBSCRIBE_DEBOUNCE_MS = 750;

type ChangePayload = RealtimePostgresChangesPayload<{ id: string }>;

/**
 * Subscribes to flood_reports changes for the grid cells covering the viewport. Runs only while
 * the map is focused and the app is in the foreground; re-subscribes when the cell set changes.
 * Events are applied by re-reading the single public row (the raw event carries WKB, not lat/lng).
 */
export function useReportsRealtime(viewport: Bbox | null, focused: boolean): RealtimeStatus {
  const queryClient = useQueryClient();
  const isOnline = useAppStore((s) => s.isOnline);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [conn, setConn] = useState<"idle" | "live" | "paused">("idle");
  const hadConnection = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);

  const cells = useMemo(() => (viewport ? cellsForBbox(viewport, MAX_REALTIME_CELLS) : []), [viewport]);
  const cellsKey = cells.join(",");

  const enabled = isSupabaseConfigured && focused && active && isOnline && viewport !== null && cells.length > 0;

  useEffect(() => {
    if (!enabled || !viewport) return;

    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const applyRow = (row: PublicReport) => {
      const entries = queryClient.getQueriesData<PublicReport[]>({ queryKey: ["reports", "bbox"] });
      for (const [key, rows] of entries) {
        if (!rows) continue;
        const bbox = bboxFromKey(key);
        if (!bbox) continue;
        const next = applyRowToViewport({ bbox, rows }, row);
        if (next !== rows) queryClient.setQueryData(key, next);
      }
      if (queryClient.getQueryData(reportQueryKey(row.id))) {
        void queryClient.invalidateQueries({ queryKey: reportQueryKey(row.id) });
      }
    };

    const onChange = async (payload: ChangePayload) => {
      if (disposed) return;
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string }).id;
        if (!id) return;
        const entries = queryClient.getQueriesData<PublicReport[]>({ queryKey: ["reports", "bbox"] });
        for (const [key, rows] of entries) {
          if (rows) {
            const next = removeRowFromViewport(rows, id);
            if (next !== rows) queryClient.setQueryData(key, next);
          }
        }
        return;
      }
      const id = (payload.new as { id?: string }).id;
      if (!id) return;
      const { data } = await supabase.from("public_flood_reports").select("*").eq("id", id).maybeSingle();
      if (data && !disposed) applyRow(data);
    };

    const timer = setTimeout(() => {
      if (disposed) return;
      setConn("idle");
      channel = supabase
        .channel(`reports:${cellsKey}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "flood_reports", filter: `geo_cell=in.(${cellsKey})` },
          (payload) => void onChange(payload as ChangePayload),
        )
        .subscribe((state) => {
          if (disposed) return;
          if (state === "SUBSCRIBED") {
            setConn("live");
            // Anything missed while disconnected is picked up by one refetch.
            if (hadConnection.current) void queryClient.invalidateQueries({ queryKey: reportsQueryKey(viewport) });
            hadConnection.current = true;
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
            setConn("paused");
          }
        });
    }, RESUBSCRIBE_DEBOUNCE_MS);

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
    // cellsKey captures the viewport's cell set; viewport itself only matters for the refetch key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellsKey, enabled, queryClient]);

  if (!isSupabaseConfigured) return { state: "off", reason: "unconfigured" };
  if (!focused || !active) return { state: "off", reason: "unfocused" };
  if (!isOnline) return { state: "off", reason: "offline" };
  if (!viewport) return { state: "off", reason: "no-viewport" };
  if (cells.length === 0) return { state: "too-wide" };
  if (conn === "idle") return { state: "connecting" };
  return { state: conn };
}

/** Query keys are ["reports","bbox","minLat,minLng,maxLat,maxLng"]. */
function bboxFromKey(key: readonly unknown[]): Bbox | null {
  const raw = key[2];
  if (typeof raw !== "string" || raw === "none") return null;
  const [minLat, minLng, maxLat, maxLng] = raw.split(",").map(Number);
  if ([minLat, minLng, maxLat, maxLng].some((v) => !Number.isFinite(v))) return null;
  return { minLat, minLng, maxLat, maxLng };
}
