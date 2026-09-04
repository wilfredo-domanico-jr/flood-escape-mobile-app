import { backoffMs, drainOutbox, isRetryable, MAX_ATTEMPTS, type Transport } from "./drainOutbox";
import type { OutboxRow, OutboxStore, ReportPayload } from "./outbox";

class MemoryStore implements OutboxStore {
  rows = new Map<string, OutboxRow>();
  async listAll() {
    return [...this.rows.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async listDue(now: number) {
    return (await this.listAll()).filter((r) => r.status === "pending" && r.nextAttemptAt <= now);
  }
  async insert(row: OutboxRow) {
    this.rows.set(row.clientId, { ...row });
  }
  async markSending(id: string) {
    this.rows.get(id)!.status = "sending";
  }
  async markPending(id: string, attempts: number, nextAttemptAt: number, error: string | null) {
    Object.assign(this.rows.get(id)!, { status: "pending", attempts, nextAttemptAt, lastError: error });
  }
  async markFailed(id: string, error: string) {
    Object.assign(this.rows.get(id)!, { status: "failed", lastError: error });
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
  async convertToMedia(id: string, reportId: string) {
    Object.assign(this.rows.get(id)!, { kind: "media", reportId, attempts: 0, nextAttemptAt: 0, lastError: null });
  }
  async retryNow(id: string) {
    Object.assign(this.rows.get(id)!, { status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null });
  }
}

const payload: ReportPayload = { lat: 14.6, lng: 121.1, accuracyM: 10, severity: "caution", description: null, photo: null };

function reportRow(clientId: string, extra: Partial<OutboxRow> = {}): OutboxRow {
  return {
    clientId,
    kind: "report",
    payload: JSON.stringify(payload),
    photoUri: null,
    reportId: null,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 1,
    ...extra,
  };
}

function fakeTransport(overrides: Partial<Transport> = {}): Transport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createReport(clientId) {
      calls.push(`create:${clientId}`);
      return { id: `server-${clientId}` };
    },
    async uploadPhoto(reportId) {
      calls.push(`upload:${reportId}`);
      return { bytes: 1234 };
    },
    async attachMedia(reportId) {
      calls.push(`attach:${reportId}`);
    },
    async verify(clientId) {
      calls.push(`verify:${clientId}`);
    },
    ...overrides,
  };
}

describe("drainOutbox", () => {
  it("sends a plain report and removes it", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a"));
    const t = fakeTransport();
    const res = await drainOutbox(store, t, () => 1000);
    expect(res).toEqual({ sent: 1, deferred: 0, failed: 0 });
    expect(t.calls).toEqual(["create:a"]);
    expect(store.rows.size).toBe(0);
  });

  it("uploads the photo after the report and cleans up", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a", { photoUri: "file:///p.jpg", payload: JSON.stringify({ ...payload, photo: { width: 10, height: 5 } }) }));
    const discarded: string[] = [];
    const t = fakeTransport({ discardPhoto: async (uri) => void discarded.push(uri) });
    await drainOutbox(store, t, () => 1000);
    expect(t.calls).toEqual(["create:a", "upload:server-a", "attach:server-a"]);
    expect(store.rows.size).toBe(0);
    expect(discarded).toEqual(["file:///p.jpg"]);
  });

  it("keeps only the photo step when the upload fails after the report succeeded", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a", { photoUri: "file:///p.jpg" }));
    const t = fakeTransport({
      uploadPhoto: async () => {
        throw new Error("network request failed");
      },
    });
    const res = await drainOutbox(store, t, () => 1000);
    expect(res).toEqual({ sent: 0, deferred: 1, failed: 0 });
    const row = store.rows.get("a")!;
    expect(row.kind).toBe("media");
    expect(row.reportId).toBe("server-a");
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBe(1000 + backoffMs(1));

    // Second pass: report is NOT re-created, only the photo is retried.
    t.uploadPhoto = async (reportId) => {
      t.calls.push(`upload:${reportId}`);
      return { bytes: 1 };
    };
    await drainOutbox(store, t, () => row.nextAttemptAt);
    expect(t.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(store.rows.size).toBe(0);
  });

  it("defers network errors with exponential backoff and never sends twice per pass", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a"));
    const t = fakeTransport({
      createReport: async () => {
        throw new TypeError("Network request failed");
      },
    });
    await drainOutbox(store, t, () => 1000);
    const row = store.rows.get("a")!;
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBe(1000 + 60_000);
    // Not due yet: nothing happens.
    const res = await drainOutbox(store, t, () => 2000);
    expect(res.sent + res.deferred + res.failed).toBe(0);
  });

  it("marks validation errors as failed immediately with the server hint", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a"));
    const t = fakeTransport({
      createReport: async () => {
        throw Object.assign(new Error("rate_limited"), { code: "P0001", hint: "Too many reports." });
      },
    });
    const res = await drainOutbox(store, t, () => 1000);
    expect(res).toEqual({ sent: 0, deferred: 0, failed: 1 });
    expect(store.rows.get("a")).toMatchObject({ status: "failed", lastError: "Too many reports." });
  });

  it("gives up after MAX_ATTEMPTS retryable failures", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a", { attempts: MAX_ATTEMPTS - 1 }));
    const t = fakeTransport({
      createReport: async () => {
        throw new Error("timeout");
      },
    });
    const res = await drainOutbox(store, t, () => 1000);
    expect(res.failed).toBe(1);
    expect(store.rows.get("a")!.status).toBe("failed");
  });

  it("processes rows in creation order", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("b", { createdAt: 2 }));
    await store.insert(reportRow("a", { createdAt: 1 }));
    const t = fakeTransport();
    await drainOutbox(store, t, () => 1000);
    expect(t.calls).toEqual(["create:a", "create:b"]);
  });

  it("sends verifications", async () => {
    const store = new MemoryStore();
    await store.insert(
      reportRow("v", { kind: "verification", payload: JSON.stringify({ reportId: "r", kind: "confirm", lat: 1, lng: 2 }) }),
    );
    const t = fakeTransport();
    await drainOutbox(store, t, () => 1000);
    expect(t.calls).toEqual(["verify:v"]);
    expect(store.rows.size).toBe(0);
  });
});

describe("drainOutbox media hold", () => {
  it("sends the report but holds the photo when media is not allowed", async () => {
    const store = new MemoryStore();
    await store.insert(reportRow("a", { photoUri: "file:///p.jpg" }));
    const t = fakeTransport();
    const res = await drainOutbox(store, t, () => 1000, { canSendMedia: () => false });
    expect(t.calls).toEqual(["create:a"]);
    expect(res.sent).toBe(1);
    const row = store.rows.get("a")!;
    expect(row.kind).toBe("media");
    expect(row.status).toBe("pending");
    expect(row.lastError).toMatch(/Wi-Fi/);

    // Once allowed, only the photo goes out.
    await drainOutbox(store, t, () => row.nextAttemptAt + 1, { canSendMedia: () => true });
    expect(t.calls).toEqual(["create:a", "upload:server-a", "attach:server-a"]);
    expect(store.rows.size).toBe(0);
  });
});

describe("isRetryable", () => {
  it("classifies errors", () => {
    expect(isRetryable(new TypeError("Network request failed"))).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ code: "22023", message: "invalid_location" })).toBe(false);
    expect(isRetryable({ code: "42501", message: "not_authenticated" })).toBe(false);
    expect(isRetryable({ code: "23505" })).toBe(false);
    expect(isRetryable({ message: "something odd" })).toBe(true);
  });
});

describe("backoffMs", () => {
  it("doubles and caps at 30 minutes", () => {
    expect(backoffMs(0)).toBe(30_000);
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});
