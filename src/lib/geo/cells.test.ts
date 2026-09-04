import { cellId, cellsForBbox } from "./cells";

describe("cellId", () => {
  it("matches the SQL geo_cell_for format", () => {
    // floor(14.6337 / 0.05) = 292 -> 14.60 ; floor(121.0988 / 0.05) = 2421 -> 121.05
    expect(cellId(14.6337, 121.0988)).toBe("14.60_121.05");
    expect(cellId(14.55, 121.0)).toBe("14.55_121.00");
    expect(cellId(14.549999, 120.999999)).toBe("14.50_120.95");
  });

  it("handles negative coordinates like SQL floor()", () => {
    expect(cellId(-0.01, -0.01)).toBe("-0.05_-0.05");
  });
});

describe("cellsForBbox", () => {
  it("returns a single cell for a bbox inside one cell", () => {
    expect(cellsForBbox({ minLat: 14.61, maxLat: 14.64, minLng: 121.06, maxLng: 121.09 }, 100)).toEqual([
      "14.60_121.05",
    ]);
  });

  it("returns the full grid over a viewport", () => {
    const cells = cellsForBbox({ minLat: 14.55, maxLat: 14.65, minLng: 121.0, maxLng: 121.1 }, 100);
    expect(cells).toEqual(["14.55_121.00", "14.55_121.05", "14.60_121.00", "14.60_121.05"]);
  });

  it("covers Metro Manila in well under the realtime filter limit", () => {
    const metroManila = { minLat: 14.35, maxLat: 14.8, minLng: 120.9, maxLng: 121.15 };
    const cells = cellsForBbox(metroManila, 100);
    expect(cells.length).toBeGreaterThan(20);
    expect(cells.length).toBeLessThanOrEqual(60);
  });

  it("refuses bboxes that need more cells than the limit", () => {
    expect(cellsForBbox({ minLat: 4, maxLat: 22, minLng: 116, maxLng: 127 }, 100)).toEqual([]);
  });
});
