import { bboxContains, bboxKey, clampBbox, expandBbox, regionToBbox, snapBbox } from "./bbox";

const region = { latitude: 14.6, longitude: 121.1, latitudeDelta: 0.1, longitudeDelta: 0.2 };

describe("bbox helpers", () => {
  it("converts a map region to a bbox", () => {
    const b = regionToBbox(region);
    expect(b.minLat).toBeCloseTo(14.55);
    expect(b.maxLat).toBeCloseTo(14.65);
    expect(b.minLng).toBeCloseTo(121);
    expect(b.maxLng).toBeCloseTo(121.2);
  });

  it("clamps oversized spans around the center", () => {
    const big = { minLat: 10, maxLat: 20, minLng: 115, maxLng: 127 };
    const clamped = clampBbox(big, 0.5);
    expect(clamped.maxLat - clamped.minLat).toBeCloseTo(0.5);
    expect(clamped.maxLng - clamped.minLng).toBeCloseTo(0.5);
    expect((clamped.minLat + clamped.maxLat) / 2).toBeCloseTo(15);
  });

  it("leaves small bboxes untouched when clamping", () => {
    const b = regionToBbox(region);
    expect(clampBbox(b, 0.5)).toEqual(b);
  });

  it("expands around the center", () => {
    const b = regionToBbox(region);
    const e = expandBbox(b, 2);
    expect(e.maxLat - e.minLat).toBeCloseTo(0.2);
    expect(e.maxLng - e.minLng).toBeCloseTo(0.4);
  });

  it("snaps outward to a grid so nearby pans share a key", () => {
    const a = snapBbox({ minLat: 14.551, maxLat: 14.649, minLng: 121.001, maxLng: 121.199 }, 0.01);
    const b = snapBbox({ minLat: 14.553, maxLat: 14.647, minLng: 121.003, maxLng: 121.197 }, 0.01);
    expect(bboxKey(a)).toBe(bboxKey(b));
    expect(a.minLat).toBeLessThanOrEqual(14.551);
    expect(a.maxLat).toBeGreaterThanOrEqual(14.649);
  });

  it("tests containment inclusively", () => {
    const b = regionToBbox(region);
    expect(bboxContains(b, { lat: 14.6, lng: 121.1 })).toBe(true);
    expect(bboxContains(b, { lat: 14.55, lng: 121 })).toBe(true);
    expect(bboxContains(b, { lat: 14.7, lng: 121.1 })).toBe(false);
  });
});
