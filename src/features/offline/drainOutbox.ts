import {
  type OutboxRow,
  type OutboxStore,
  parsePayload,
  type ReportPayload,
  type VerificationPayload,
} from "./outbox";

export type PhotoMeta = { width: number | null; height: number | null; bytes: number | null };

/** Network side of the outbox. The real one talks to Supabase; tests use a fake. */
export interface Transport {
  createReport(clientId: string, payload: ReportPayload): Promise<{ id: string }>;
  uploadPhoto(reportId: string, uri: string): Promise<{ bytes: number | null }>;
  attachMedia(reportId: string, meta: PhotoMeta): Promise<void>;
  verify(clientId: string, payload: VerificationPayload): Promise<void>;
  /** Remove the local photo file once it is safely uploaded. */
  discardPhoto?(uri: string): Promise<void>;
}

export type DrainResult = { sent: number; deferred: number; failed: number };

export const MAX_ATTEMPTS = 8;

/** 30 s, 1 min, 2 min, ... capped at 30 min. */
export function backoffMs(attempts: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts));
}

type ErrorLike = { message?: string; code?: string; status?: number; statusCode?: string | number; name?: string };

/**
 * Decide whether an error is worth retrying. Validation, auth and rate-limit errors are final;
 * everything that smells like connectivity or a server hiccup retries with backoff.
 */
export function isRetryable(error: unknown): boolean {
  const e = (error ?? {}) as ErrorLike;
  const status = Number(e.status ?? e.statusCode ?? 0);
  if (status >= 500) return true;
  if (status >= 400) return status === 408 || status === 429;
  if (typeof e.code === "string") {
    // PostgREST/Postgres error codes: 22xxx data errors, 23xxx constraints, 42501 privilege, P0001 raised.
    if (/^(22|23|42|P0)/.test(e.code)) return false;
    if (e.code === "PGRST301" || e.code === "PGRST302") return false; // JWT problems
  }
  const msg = (e.message ?? "").toLowerCase();
  if (/network|fetch|timeout|timed out|socket|econn|unreachable/.test(msg)) return true;
  return true; // unknown: retry, bounded by MAX_ATTEMPTS
}

/** Human-readable failure text, using the server hint when present. */
export function describeOutboxError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike & { hint?: string; details?: string };
  if (e.hint) return e.hint;
  const msg = e.message ?? "";
  if (/rate_limited/.test(msg)) return "Too many reports in a short time. Try again in a few minutes.";
  if (/invalid_location/.test(msg)) return "The location must be inside the Philippines.";
  if (/description_too_long/.test(msg)) return "Keep the description under 500 characters.";
  if (/not_authenticated|jwt/i.test(msg)) return "You were signed out. Open the app to sign in again.";
  return msg || "Could not send. Tap to retry.";
}

/**
 * Sends every due outbox row exactly once, in creation order. Safe to call repeatedly:
 * the caller is expected to single-flight it, and the server is idempotent on client_id.
 */
export async function drainOutbox(
  store: OutboxStore,
  transport: Transport,
  now: () => number = () => Date.now(),
): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, deferred: 0, failed: 0 };
  const due = await store.listDue(now());

  for (const row of due) {
    await store.markSending(row.clientId);
    try {
      await sendRow(row, store, transport);
      result.sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      if (isRetryable(error) && attempts < MAX_ATTEMPTS) {
        await store.markPending(row.clientId, attempts, now() + backoffMs(attempts), describeOutboxError(error));
        result.deferred += 1;
      } else {
        await store.markFailed(row.clientId, describeOutboxError(error));
        result.failed += 1;
      }
    }
  }
  return result;
}

async function sendRow(row: OutboxRow, store: OutboxStore, transport: Transport): Promise<void> {
  switch (row.kind) {
    case "report": {
      const payload = parsePayload<ReportPayload>(row);
      const { id } = await transport.createReport(row.clientId, payload);
      if (row.photoUri) {
        // The report exists now; from here on only the photo can fail.
        await store.convertToMedia(row.clientId, id);
        await sendMedia({ ...row, kind: "media", reportId: id }, store, transport);
      } else {
        await store.remove(row.clientId);
      }
      return;
    }
    case "media":
      await sendMedia(row, store, transport);
      return;
    case "verification": {
      const payload = parsePayload<VerificationPayload>(row);
      await transport.verify(row.clientId, payload);
      await store.remove(row.clientId);
      return;
    }
  }
}

async function sendMedia(row: OutboxRow, store: OutboxStore, transport: Transport): Promise<void> {
  if (!row.reportId || !row.photoUri) {
    await store.remove(row.clientId);
    return;
  }
  const payload = parsePayload<ReportPayload>(row);
  const { bytes } = await transport.uploadPhoto(row.reportId, row.photoUri);
  await transport.attachMedia(row.reportId, {
    width: payload.photo?.width ?? null,
    height: payload.photo?.height ?? null,
    bytes,
  });
  await store.remove(row.clientId);
  await transport.discardPhoto?.(row.photoUri).catch(() => {});
}
