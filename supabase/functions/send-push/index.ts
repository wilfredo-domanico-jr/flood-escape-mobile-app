// send-push Edge Function.
// Drains notification_outbox through the Expo Push API. Called every minute by pg_cron
// (public.trigger_send_push) with a shared secret; the app never calls it. Also checks push
// receipts for recently sent rows so dead tokens (uninstalled apps) are removed.
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 100;
const MAX_ATTEMPTS = 3;
const CHANNEL_ID = "route-alerts";

type OutboxRow = {
  id: number;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
type Receipt = { status: "ok" } | { status: "error"; message: string; details?: { error?: string } };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function expoHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const token = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("PUSH_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json(401, { error: "unauthorized" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const summary = { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0, tokensRemoved: 0, receiptsChecked: 0 };

  // ---- Claim pending rows ---------------------------------------------------------------
  const { data: pending, error: claimError } = await admin
    .from("notification_outbox")
    .select("id, user_id, title, body, data, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (claimError) return json(500, { error: claimError.message });
  const rows = (pending ?? []) as OutboxRow[];
  summary.claimed = rows.length;

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await admin.from("notification_outbox").update({ status: "sending" }).in("id", ids);

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: tokenRows } = await admin.from("device_push_tokens").select("token, user_id").in("user_id", userIds);
    const tokensByUser = new Map<string, string[]>();
    for (const t of tokenRows ?? []) {
      tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
    }

    // One message per (row, token). Remember the mapping so tickets can be attributed.
    const messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: string; channelId: string; priority: string }[] = [];
    const owners: { rowId: number; token: string }[] = [];
    const noToken: number[] = [];
    for (const r of rows) {
      const tokens = tokensByUser.get(r.user_id) ?? [];
      if (tokens.length === 0) {
        noToken.push(r.id);
        continue;
      }
      for (const to of tokens) {
        messages.push({ to, title: r.title, body: r.body, data: r.data ?? {}, sound: "default", channelId: CHANNEL_ID, priority: "high" });
        owners.push({ rowId: r.id, token: to });
      }
    }
    if (noToken.length > 0) {
      await admin.from("notification_outbox").update({ status: "skipped" }).in("id", noToken);
      summary.skipped += noToken.length;
    }

    const okByRow = new Map<number, { ticket: string; token: string }>();
    const errorByRow = new Map<number, string>();
    const deadTokens = new Set<string>();
    let offset = 0;
    for (const batch of chunk(messages, BATCH)) {
      let tickets: Ticket[] = [];
      try {
        const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers: expoHeaders(), body: JSON.stringify(batch) });
        const body = await res.json();
        tickets = (body.data ?? []) as Ticket[];
        if (!res.ok || tickets.length !== batch.length) {
          for (let i = 0; i < batch.length; i++) errorByRow.set(owners[offset + i].rowId, `push_http_${res.status}`);
          offset += batch.length;
          continue;
        }
      } catch (e) {
        for (let i = 0; i < batch.length; i++) errorByRow.set(owners[offset + i].rowId, `push_fetch_failed:${String(e)}`);
        offset += batch.length;
        continue;
      }
      tickets.forEach((t, i) => {
        const { rowId, token } = owners[offset + i];
        if (t.status === "ok") {
          if (!okByRow.has(rowId)) okByRow.set(rowId, { ticket: t.id, token });
        } else {
          if (t.details?.error === "DeviceNotRegistered") deadTokens.add(token);
          if (!okByRow.has(rowId)) errorByRow.set(rowId, t.details?.error ?? t.message);
        }
      });
      offset += batch.length;
    }

    const now = new Date().toISOString();
    for (const r of rows) {
      if (noToken.includes(r.id)) continue;
      const ok = okByRow.get(r.id);
      if (ok) {
        await admin.from("notification_outbox").update({ status: "sent", sent_at: now, ticket_id: ok.ticket, token: ok.token, attempts: r.attempts + 1 }).eq("id", r.id);
        summary.sent += 1;
      } else {
        const attempts = r.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS;
        await admin
          .from("notification_outbox")
          .update({ status: final ? "failed" : "pending", attempts, data: { ...(r.data ?? {}), last_error: errorByRow.get(r.id) ?? "unknown" } })
          .eq("id", r.id);
        if (final) summary.failed += 1;
        else summary.deferred += 1;
      }
    }
    if (deadTokens.size > 0) {
      await admin.from("device_push_tokens").delete().in("token", [...deadTokens]);
      summary.tokensRemoved += deadTokens.size;
    }
  }

  // ---- Receipts for rows sent 1 to 30 minutes ago ---------------------------------------
  const { data: sentRows } = await admin
    .from("notification_outbox")
    .select("id, ticket_id, token")
    .eq("status", "sent")
    .eq("receipt_checked", false)
    .not("ticket_id", "is", null)
    .gt("sent_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .lt("sent_at", new Date(Date.now() - 60_000).toISOString())
    .limit(300);
  const receiptsToCheck = (sentRows ?? []) as { id: number; ticket_id: string; token: string | null }[];
  if (receiptsToCheck.length > 0) {
    const dead = new Set<string>();
    for (const batch of chunk(receiptsToCheck, 300)) {
      try {
        const res = await fetch(EXPO_RECEIPTS_URL, {
          method: "POST",
          headers: expoHeaders(),
          body: JSON.stringify({ ids: batch.map((r) => r.ticket_id) }),
        });
        if (!res.ok) continue;
        const body = await res.json();
        const receipts = (body.data ?? {}) as Record<string, Receipt>;
        for (const r of batch) {
          const rc = receipts[r.ticket_id];
          if (rc && rc.status === "error" && rc.details?.error === "DeviceNotRegistered" && r.token) dead.add(r.token);
        }
        await admin.from("notification_outbox").update({ receipt_checked: true }).in("id", batch.map((r) => r.id));
        summary.receiptsChecked += batch.length;
      } catch {
        // Try again next minute.
      }
    }
    if (dead.size > 0) {
      await admin.from("device_push_tokens").delete().in("token", [...dead]);
      summary.tokensRemoved += dead.size;
    }
  }

  return json(200, summary);
});
