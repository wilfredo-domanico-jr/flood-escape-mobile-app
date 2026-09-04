import { classifyRouteRisk, NEAR_ROUTE_M, ON_ROUTE_M, type RouteHit } from "./routeRisk";

function hit(overrides: Partial<RouteHit>): RouteHit {
  return {
    id: Math.random().toString(36).slice(2),
    severity: "caution",
    confidence_level: "medium",
    effective_status: "active",
    distance_m: 10,
    ...overrides,
  };
}

describe("classifyRouteRisk", () => {
  it("is safe with no hits and never promises a clear road", () => {
    const r = classifyRouteRisk([]);
    expect(r.level).toBe("safe");
    expect(r.detail).toMatch(/does not guarantee/);
  });

  it("flags impassable on the route as high risk at any confidence", () => {
    expect(classifyRouteRisk([hit({ severity: "impassable", confidence_level: "low", distance_m: 30 })]).level).toBe("high");
  });

  it("flags dangerous on the route as high only with medium+ confidence", () => {
    expect(classifyRouteRisk([hit({ severity: "dangerous", confidence_level: "low", distance_m: 30 })]).level).toBe("caution");
    expect(classifyRouteRisk([hit({ severity: "dangerous", confidence_level: "medium", distance_m: 30 })]).level).toBe("high");
  });

  it("treats caution/passable on the route as caution", () => {
    expect(classifyRouteRisk([hit({ severity: "passable", confidence_level: "high", distance_m: 5 })]).level).toBe("caution");
  });

  it("uses medium+ confidence for near-route hits and ignores low ones", () => {
    expect(classifyRouteRisk([hit({ distance_m: ON_ROUTE_M + 50, confidence_level: "low" })]).level).toBe("safe");
    expect(classifyRouteRisk([hit({ distance_m: ON_ROUTE_M + 50, confidence_level: "medium" })]).level).toBe("caution");
  });

  it("ignores hits beyond the near radius and resolved reports", () => {
    expect(classifyRouteRisk([hit({ distance_m: NEAR_ROUTE_M + 1, severity: "impassable" })]).level).toBe("safe");
    expect(classifyRouteRisk([hit({ distance_m: 5, severity: "impassable", effective_status: "resolved" })]).level).toBe("safe");
  });

  it("splits and sorts hits by distance", () => {
    const r = classifyRouteRisk([
      hit({ id: "b", distance_m: 60 }),
      hit({ id: "a", distance_m: 20 }),
      hit({ id: "c", distance_m: 200 }),
    ]);
    expect(r.onRoute.map((h) => h.id)).toEqual(["a", "b"]);
    expect(r.near.map((h) => h.id)).toEqual(["c"]);
  });

  it("explains the worst on-route report", () => {
    const r = classifyRouteRisk([
      hit({ severity: "dangerous", confidence_level: "high", distance_m: 10 }),
      hit({ severity: "impassable", confidence_level: "low", distance_m: 40 }),
    ]);
    expect(r.detail).toMatch(/impassable/);
  });
});
