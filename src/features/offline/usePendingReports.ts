import { useEffect, useState } from "react";

import type { PublicReport } from "@/lib/supabase/database.types";

import { type OutboxRow, parsePayload, type ReportPayload, sqliteOutbox, subscribeOutbox } from "./outbox";

export type PendingReport = {
  clientId: string;
  payload: ReportPayload;
  status: OutboxRow["status"];
  kind: OutboxRow["kind"];
  reportId: string | null;
  lastError: string | null;
  attempts: number;
  createdAt: number;
};

/** Live view of queued reports (not verifications) for optimistic pins and the Activity list. */
export function usePendingReports(): PendingReport[] {
  const [rows, setRows] = useState<PendingReport[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await sqliteOutbox.listAll();
      if (!alive) return;
      setRows(
        all
          .filter((r) => r.kind === "report" || r.kind === "media")
          .map((r) => ({
            clientId: r.clientId,
            payload: parsePayload<ReportPayload>(r),
            status: r.status,
            kind: r.kind,
            reportId: r.reportId,
            lastError: r.lastError,
            attempts: r.attempts,
            createdAt: r.createdAt,
          })),
      );
    };
    void load();
    const unsubscribe = subscribeOutbox(() => void load());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return rows;
}

/** Shapes a queued report like a server row so cards and markers can render it unchanged. */
export function pendingToPublicReport(p: PendingReport): PublicReport {
  const created = new Date(p.createdAt).toISOString();
  return {
    id: `pending:${p.clientId}`,
    severity: p.payload.severity,
    effective_status: "active",
    stored_status: "active",
    lat: p.payload.lat,
    lng: p.payload.lng,
    location_accuracy_m: p.payload.accuracyM,
    geo_cell: "",
    description: p.payload.description,
    has_photo: p.payload.photo != null,
    photo_path: null,
    confirm_count: 0,
    clear_count: 0,
    nearby_report_count: 0,
    confidence_score: 0,
    confidence_level: "low",
    confidence_reasons: ["Not sent yet"],
    created_at: created,
    last_confirmed_at: created,
    expires_at: created,
    resolved_at: null,
    updated_at: created,
  };
}
