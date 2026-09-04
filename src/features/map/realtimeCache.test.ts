import type { PublicReport } from "@/lib/supabase/database.types";

import { applyRowToViewport, removeRowFromViewport } from "./realtimeCache";

const bbox = { minLat: 14.5, maxLat: 14.7, minLng: 121.0, maxLng: 121.2 };

function row(overrides: Partial<PublicReport>): PublicReport {
  return {
    id: "r1",
    severity: "caution",
    effective_status: "active",
    stored_status: "active",
    lat: 14.6,
    lng: 121.1,
    location_accuracy_m: null,
    geo_cell: "14.60_121.10",
    description: null,
    has_photo: false,
    photo_path: null,
    confirm_count: 0,
    clear_count: 0,
    nearby_report_count: 0,
    confidence_score: 45,
    confidence_level: "medium",
    confidence_reasons: [],
    created_at: "2026-09-04T00:00:00Z",
    last_confirmed_at: "2026-09-04T00:00:00Z",
    expires_at: "2026-09-04T06:00:00Z",
    resolved_at: null,
    updated_at: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

describe("applyRowToViewport", () => {
  it("prepends a new row inside the bbox", () => {
    const rows = [row({ id: "old" })];
    const next = applyRowToViewport({ bbox, rows }, row({ id: "new" }));
    expect(next.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("ignores rows outside the bbox", () => {
    const rows = [row({ id: "old" })];
    expect(applyRowToViewport({ bbox, rows }, row({ id: "far", lat: 10, lng: 120 }))).toBe(rows);
  });

  it("replaces a changed row in place", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const next = applyRowToViewport({ bbox, rows }, row({ id: "a", updated_at: "2026-09-04T01:00:00Z", confirm_count: 2 }));
    expect(next[0].confirm_count).toBe(2);
    expect(next[1]).toBe(rows[1]);
  });

  it("returns the same array when nothing changed", () => {
    const rows = [row({ id: "a" })];
    expect(applyRowToViewport({ bbox, rows }, row({ id: "a" }))).toBe(rows);
  });

  it("removes rows that became resolved", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const next = applyRowToViewport({ bbox, rows }, row({ id: "a", effective_status: "resolved", stored_status: "resolved" }));
    expect(next.map((r) => r.id)).toEqual(["b"]);
  });

  it("does not add resolved rows", () => {
    const rows: PublicReport[] = [];
    expect(applyRowToViewport({ bbox, rows }, row({ id: "x", effective_status: "resolved" }))).toBe(rows);
  });
});

describe("removeRowFromViewport", () => {
  it("removes by id and keeps identity otherwise", () => {
    const rows = [row({ id: "a" })];
    expect(removeRowFromViewport(rows, "zzz")).toBe(rows);
    expect(removeRowFromViewport(rows, "a")).toEqual([]);
  });
});
