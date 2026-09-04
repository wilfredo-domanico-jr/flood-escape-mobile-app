import type { ConfidenceLevel } from "@/constants/severity";

/**
 * Mirror of `public.compute_confidence()` in supabase/migrations/20260904000600_confidence.sql.
 * Deterministic and explainable. The fixture test proves both implementations agree.
 */
export type ConfidenceInput = {
  /** Minutes since the last confirmation (or the report itself). */
  ageMin: number;
  /** Distinct users who said "still flooded" in the last 6 h. */
  confirms: number;
  /** Distinct users who said "no longer flooded" in the last 6 h. */
  clears: number;
  /** Distinct other reporters within 150 m in the last 6 h. */
  nearby: number;
  hasPhoto: boolean;
  /** Reporter reputation in [0.2, 0.9]; 0.5 is neutral. */
  reputation: number;
  /** True when ageMin measures a confirmation rather than the original report. */
  confirmedLater?: boolean;
};

export type ConfidenceResult = { score: number; level: ConfidenceLevel; reasons: string[] };

export const RECENCY_MAX = 45;
export const RECENCY_HALF_LIFE_MIN = 180;
export const CONFIRM_WEIGHT = 12;
export const CONFIRM_CAP = 4;
export const NEARBY_WEIGHT = 8;
export const NEARBY_CAP = 3;
export const PHOTO_WEIGHT = 10;
export const REPUTATION_WEIGHT = 10;
export const CLEAR_WEIGHT = 15;
export const CLEAR_CAP = 3;
export const HIGH_THRESHOLD = 70;
export const MEDIUM_THRESHOLD = 40;

/** Postgres round(): half away from zero. Math.round is half toward +inf, same for positives. */
const roundHalfAway = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v));

/** Postgres round(numeric, 1) on a value that came from float8. */
function roundOneDecimal(v: number): string {
  const scaled = v * 10;
  const rounded = roundHalfAway(scaled + (scaled >= 0 ? 1e-9 : -1e-9));
  return (rounded / 10).toFixed(1);
}

export function levelForScore(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MEDIUM_THRESHOLD) return "medium";
  return "low";
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const age = Math.max(0, Number.isFinite(input.ageMin) ? input.ageMin : 0);
  const confirms = Math.max(0, input.confirms | 0);
  const clears = Math.max(0, input.clears | 0);
  const nearby = Math.max(0, input.nearby | 0);
  const reputation = Number.isFinite(input.reputation) ? input.reputation : 0.5;

  const raw =
    RECENCY_MAX * Math.pow(2, -age / RECENCY_HALF_LIFE_MIN) +
    CONFIRM_WEIGHT * Math.min(confirms, CONFIRM_CAP) +
    NEARBY_WEIGHT * Math.min(nearby, NEARBY_CAP) +
    (input.hasPhoto ? PHOTO_WEIGHT : 0) +
    REPUTATION_WEIGHT * (reputation - 0.5) -
    CLEAR_WEIGHT * Math.min(clears, CLEAR_CAP);

  const score = Math.max(0, Math.min(100, roundHalfAway(raw)));
  const prefix = input.confirmedLater ? "Last confirmed" : "Reported";

  const reasons: string[] = [];
  reasons.push(age < 60 ? `${prefix} ${roundHalfAway(age)} min ago` : `${prefix} ${roundOneDecimal(age / 60)} h ago`);
  if (confirms > 0) reasons.push(`${confirms} ${confirms === 1 ? "person" : "people"} confirmed`);
  if (nearby > 0) reasons.push(`${nearby} other nearby report${nearby === 1 ? "" : "s"}`);
  if (input.hasPhoto) reasons.push("Photo attached");
  if (clears > 0) reasons.push(`${clears} ${clears === 1 ? "person says" : "people say"} it has cleared`);
  if (reputation >= 0.7) reasons.push("Trusted reporter");

  return { score, level: levelForScore(score), reasons };
}
