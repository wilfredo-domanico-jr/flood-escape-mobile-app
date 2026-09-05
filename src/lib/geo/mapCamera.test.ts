import { haversineDistanceM } from "./distance";
import { bboxToBounds, boundsForPoints, boundsToBbox, circlePolygon, toLngLat, zoomForSpan } from "./mapCamera";

describe("zoomForSpan", () => {
  it("zooms in as the span shrinks", () => {
    expect(zoomForSpan(0.12)).toBeLessThan(zoomForSpan(0.02));
    expect(zoomForSpan(0.02)).toBeLessThan(zoomForSpan(0.004));
  });
  it("lands in the expected ranges for the app's spans", () => {
    expect(zoomForSpan(0.12)).toBeGreaterThan(10.5);
    expect(zoomForSpan(0.12)).toBeLessThan(12);
    expect(zoomForSpan(0.004)).toBeGreaterThan(15.5);
    expect(zoomForSpan(0.004)).toBeLessThan(17);
  });
  it("does not blow up on a zero span", () => {
    expect(Number.isFinite(zoomForSpan(0))).toBe(true);
  });
});

describe("bounds conversions", () => {
  it("round-trips bbox and bounds", () => {
    const bbox = { minLat: 14.5, minLng: 120.9, maxLat: 14.7, maxLng: 121.1 };
    expect(boundsToBbox(bboxToBounds(bbox))).toEqual(bbox);
    expect(bboxToBounds(bbox)).toEqual([120.9, 14.5, 121.1, 14.7]);
  });
  it("orders lng before lat", () => {
    expect(toLngLat({ lat: 14.6, lng: 121.0 })).toEqual([121.0, 14.6]);
  });
});

describe("boundsForPoints", () => {
  it("returns null for no points", () => {
    expect(boundsForPoints([])).toBeNull();
  });
  it("encloses all points with a margin", () => {
    const b = boundsForPoints([{ lat: 14.6, lng: 121.0 }, { lat: 14.7, lng: 121.1 }], 1.2)!;
    expect(b[0]).toBeLessThan(121.0);
    expect(b[1]).toBeLessThan(14.6);
    expect(b[2]).toBeGreaterThan(121.1);
    expect(b[3]).toBeGreaterThan(14.7);
  });
  it("never collapses to a point", () => {
    const b = boundsForPoints([{ lat: 14.6, lng: 121.0 }])!;
    expect(b[2] - b[0]).toBeGreaterThan(0.004);
    expect(b[3] - b[1]).toBeGreaterThan(0.004);
  });
});

describe("circlePolygon", () => {
  it("produces a closed ring whose points sit radiusM from the center", () => {
    const center = { lat: 14.65, lng: 121.1 };
    const f = circlePolygon(center, 120, 32);
    const ring = f.geometry.coordinates[0];
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const [lng, lat] of ring) {
      expect(Math.abs(haversineDistanceM(center, { lat, lng }) - 120)).toBeLessThan(2);
    }
  });
});
