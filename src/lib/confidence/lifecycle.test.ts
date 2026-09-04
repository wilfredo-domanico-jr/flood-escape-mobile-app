import { effectiveStatus, isActionable, overlayLifecycle, STALE_TO_RESOLVED_MS, staleWindowMs } from "./lifecycle";

const NOW = Date.parse("2026-09-04T12:00:00Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("staleWindowMs", () => {
  it("matches the SQL stale_window table", () => {
    expect(staleWindowMs("impassable")).toBe(6 * 3_600_000);
    expect(staleWindowMs("dangerous")).toBe(6 * 3_600_000);
    expect(staleWindowMs("caution")).toBe(4 * 3_600_000);
    expect(staleWindowMs("passable")).toBe(3 * 3_600_000);
  });
});

describe("effectiveStatus", () => {
  it("keeps active reports active before expiry", () => {
    expect(effectiveStatus({ stored_status: "active", expires_at: at(60_000) }, NOW)).toBe("active");
  });

  it("turns active into stale once expired, even before the server sweep ran", () => {
    expect(effectiveStatus({ stored_status: "active", expires_at: at(-1) }, NOW)).toBe("stale");
  });

  it("treats very old stale reports as resolved", () => {
    expect(effectiveStatus({ stored_status: "stale", expires_at: at(-STALE_TO_RESOLVED_MS - 1) }, NOW)).toBe("resolved");
  });

  it("never touches resolved or disputed", () => {
    expect(effectiveStatus({ stored_status: "resolved", expires_at: at(60_000) }, NOW)).toBe("resolved");
    expect(effectiveStatus({ stored_status: "disputed", expires_at: at(-60_000) }, NOW)).toBe("disputed");
  });

  it("tolerates bad dates", () => {
    expect(effectiveStatus({ stored_status: "active", expires_at: "nope" }, NOW)).toBe("active");
  });
});

describe("isActionable", () => {
  it("only resolved reports are closed", () => {
    expect(isActionable("resolved")).toBe(false);
    expect(isActionable("stale")).toBe(true);
    expect(isActionable("disputed")).toBe(true);
  });
});

describe("overlayLifecycle", () => {
  const row = (id: string, expiresIn: number, status: "active" | "stale" = "active") => ({
    id,
    stored_status: status,
    effective_status: status,
    expires_at: at(expiresIn),
  });

  it("keeps identity when nothing changed", () => {
    const rows = [row("a", 60_000)];
    expect(overlayLifecycle(rows, NOW)).toBe(rows);
  });

  it("marks expired rows stale without touching others", () => {
    const rows = [row("a", -1), row("b", 60_000)];
    const next = overlayLifecycle(rows, NOW);
    expect(next[0].effective_status).toBe("stale");
    expect(next[1]).toBe(rows[1]);
  });
});
