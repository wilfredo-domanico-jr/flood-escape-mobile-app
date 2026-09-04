import type { Severity } from "@/constants/severity";
import { getDb } from "@/db/sqlite";

export type OutboxKind = "report" | "media" | "verification";
export type OutboxStatus = "pending" | "sending" | "failed";

export type ReportPayload = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  severity: Severity;
  description: string | null;
  /** Dimensions of the compressed photo, if any (the file itself lives at photoUri). */
  photo: { width: number; height: number } | null;
};

export type VerificationPayload = {
  reportId: string;
  kind: "confirm" | "clear";
  lat: number | null;
  lng: number | null;
};

export type OutboxRow = {
  clientId: string;
  kind: OutboxKind;
  payload: string;
  photoUri: string | null;
  reportId: string | null;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
};

/** Storage interface for the outbox so the drain logic can be unit-tested with an in-memory fake. */
export interface OutboxStore {
  listAll(): Promise<OutboxRow[]>;
  listDue(now: number): Promise<OutboxRow[]>;
  insert(row: OutboxRow): Promise<void>;
  markSending(clientId: string): Promise<void>;
  markPending(clientId: string, attempts: number, nextAttemptAt: number, error: string | null): Promise<void>;
  markFailed(clientId: string, error: string): Promise<void>;
  remove(clientId: string): Promise<void>;
  /** After the report row is created server-side, only the photo still needs sending. */
  convertToMedia(clientId: string, reportId: string): Promise<void>;
  /** User-initiated retry of a failed row. */
  retryNow(clientId: string): Promise<void>;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

type DbRow = {
  client_id: string;
  kind: OutboxKind;
  payload: string;
  photo_uri: string | null;
  report_id: string | null;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
};

const fromDb = (r: DbRow): OutboxRow => ({
  clientId: r.client_id,
  kind: r.kind,
  payload: r.payload,
  photoUri: r.photo_uri,
  reportId: r.report_id,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error,
  createdAt: r.created_at,
});

export const sqliteOutbox: OutboxStore = {
  async listAll() {
    const db = await getDb();
    const rows = await db.getAllAsync<DbRow>("SELECT * FROM outbox ORDER BY created_at ASC");
    return rows.map(fromDb);
  },
  async listDue(now) {
    const db = await getDb();
    const rows = await db.getAllAsync<DbRow>(
      "SELECT * FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at ASC",
      now,
    );
    return rows.map(fromDb);
  },
  async insert(row) {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR IGNORE INTO outbox
        (client_id, kind, payload, photo_uri, report_id, status, attempts, next_attempt_at, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.clientId,
      row.kind,
      row.payload,
      row.photoUri,
      row.reportId,
      row.status,
      row.attempts,
      row.nextAttemptAt,
      row.lastError,
      row.createdAt,
    );
    notify();
  },
  async markSending(clientId) {
    const db = await getDb();
    await db.runAsync("UPDATE outbox SET status = 'sending' WHERE client_id = ?", clientId);
    notify();
  },
  async markPending(clientId, attempts, nextAttemptAt, error) {
    const db = await getDb();
    await db.runAsync(
      "UPDATE outbox SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ? WHERE client_id = ?",
      attempts,
      nextAttemptAt,
      error,
      clientId,
    );
    notify();
  },
  async markFailed(clientId, error) {
    const db = await getDb();
    await db.runAsync("UPDATE outbox SET status = 'failed', last_error = ? WHERE client_id = ?", error, clientId);
    notify();
  },
  async remove(clientId) {
    const db = await getDb();
    await db.runAsync("DELETE FROM outbox WHERE client_id = ?", clientId);
    notify();
  },
  async convertToMedia(clientId, reportId) {
    const db = await getDb();
    await db.runAsync(
      "UPDATE outbox SET kind = 'media', report_id = ?, attempts = 0, next_attempt_at = 0, last_error = NULL WHERE client_id = ?",
      reportId,
      clientId,
    );
    notify();
  },
  async retryNow(clientId) {
    const db = await getDb();
    await db.runAsync(
      "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = 0, last_error = NULL WHERE client_id = ?",
      clientId,
    );
    notify();
  },
};

export function parsePayload<T>(row: OutboxRow): T {
  return JSON.parse(row.payload) as T;
}
