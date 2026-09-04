import { formatDistance, haversineDistanceM } from "./distance";

describe("haversineDistanceM", () => {
  it("returns 0 for identical points", () => {
    const p = { lat: 14.6335, lng: 121.0987 };
    expect(haversineDistanceM(p, p)).toBe(0);
  });

  it("matches a known distance (Marikina Sports Center → Pasig City Hall ≈ 5.1 km)", () => {
    const marikina = { lat: 14.6335, lng: 121.0987 };
    const pasig = { lat: 14.5764, lng: 121.0851 };
    const d = haversineDistanceM(marikina, pasig);
    expect(d).toBeGreaterThan(6_400);
    expect(d).toBeLessThan(6_600);
  });

  it("is symmetric", () => {
    const a = { lat: 14.55, lng: 121.0 };
    const b = { lat: 14.6, lng: 121.05 };
    expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 6);
  });

  it("handles ~1 degree of latitude ≈ 111 km", () => {
    const d = haversineDistanceM({ lat: 14, lng: 121 }, { lat: 15, lng: 121 });
    expect(d / 1000).toBeCloseTo(111.2, 0);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [85.4, "85 m"],
    [999, "999 m"],
    [1234, "1.2 km"],
    [9_940, "9.9 km"],
    [9_950, "10 km"],
    [12_400, "12 km"],
  ])("formats %p as %p", (m, expected) => {
    expect(formatDistance(m)).toBe(expected);
  });

  it("returns a dash for invalid input", () => {
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatDistance(-5)).toBe("—");
  });
});
