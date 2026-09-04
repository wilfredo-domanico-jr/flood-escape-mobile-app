import { SEVERITY_RANK, type Severity } from "@/constants/severity";

export type RiskLevel = "safe" | "caution" | "high";

export type RouteHit = {
  id: string;
  severity: Severity;
  confidence_level: "low" | "medium" | "high";
  effective_status: "active" | "stale" | "resolved" | "disputed";
  distance_m: number;
};

export type RouteRisk = {
  level: RiskLevel;
  onRoute: RouteHit[];
  near: RouteHit[];
  headline: string;
  detail: string;
};

/** A report this close to the line is treated as on the road itself. */
export const ON_ROUTE_M = 75;
/** Beyond this the report is ignored even if the server returned it. */
export const NEAR_ROUTE_M = 300;

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * Explainable route risk. Mirrors the plan:
 *  HIGH RISK  any on-route hit that is (dangerous+ with medium+ confidence) or impassable at any confidence
 *  CAUTION    any other on-route hit, or a near-route hit with medium+ confidence
 *  SAFE       nothing within reach — worded as "no recent reports", never as a guarantee
 */
export function classifyRouteRisk(hits: RouteHit[]): RouteRisk {
  const usable = hits.filter((h) => h.effective_status !== "resolved" && h.distance_m <= NEAR_ROUTE_M);
  const onRoute = usable.filter((h) => h.distance_m <= ON_ROUTE_M).sort((a, b) => a.distance_m - b.distance_m);
  const near = usable.filter((h) => h.distance_m > ON_ROUTE_M).sort((a, b) => a.distance_m - b.distance_m);

  const high = onRoute.filter(
    (h) =>
      h.severity === "impassable" ||
      (SEVERITY_RANK[h.severity] >= SEVERITY_RANK.dangerous && CONFIDENCE_RANK[h.confidence_level] >= CONFIDENCE_RANK.medium),
  );

  if (high.length > 0) {
    const worst = high.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));
    return {
      level: "high",
      onRoute,
      near,
      headline: "High risk",
      detail:
        worst.severity === "impassable"
          ? `Your route crosses a spot reported impassable (${worst.confidence_level} confidence). Expect to turn back.`
          : `Your route crosses recent ${worst.confidence_level}-confidence flooding reported as dangerous.`,
    };
  }

  const nearMedium = near.filter((h) => CONFIDENCE_RANK[h.confidence_level] >= CONFIDENCE_RANK.medium);
  if (onRoute.length > 0 || nearMedium.length > 0) {
    const count = onRoute.length + nearMedium.length;
    return {
      level: "caution",
      onRoute,
      near,
      headline: "Caution",
      detail:
        onRoute.length > 0
          ? `${onRoute.length} flood report${onRoute.length === 1 ? "" : "s"} on your route. Check the details before you go.`
          : `${count} recent flood report${count === 1 ? "" : "s"} within ${NEAR_ROUTE_M} m of your route.`,
    };
  }

  return {
    level: "safe",
    onRoute,
    near,
    headline: "No recent reports",
    detail: "No recent flood reports detected along your route. That does not guarantee the road is clear.",
  };
}
