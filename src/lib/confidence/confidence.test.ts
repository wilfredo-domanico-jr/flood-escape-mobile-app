import fixture from "./__fixtures__/compute_confidence.json";
import { computeConfidence, levelForScore } from "./confidence";

type Case = {
  age: number;
  confirms: number;
  clears: number;
  nearby: number;
  photo: boolean;
  reputation: number;
  later: boolean;
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
};

describe("computeConfidence matches the SQL implementation", () => {
  const cases = fixture as Case[];

  it("has a meaningful fixture", () => {
    expect(cases.length).toBeGreaterThan(200);
  });

  it.each(cases.map((c, i) => [i, c] as const))("case %i agrees with SQL", (_i, c) => {
    const result = computeConfidence({
      ageMin: c.age,
      confirms: c.confirms,
      clears: c.clears,
      nearby: c.nearby,
      hasPhoto: c.photo,
      reputation: c.reputation,
      confirmedLater: c.later,
    });
    expect(result.score).toBe(c.score);
    expect(result.level).toBe(c.level);
    expect(result.reasons).toEqual(c.reasons);
  });
});

describe("computeConfidence behaviour", () => {
  const base = { ageMin: 0, confirms: 0, clears: 0, nearby: 0, hasPhoto: false, reputation: 0.5 };

  it("starts a fresh unconfirmed report at medium", () => {
    expect(computeConfidence(base)).toMatchObject({ score: 45, level: "medium" });
  });

  it("reaches high after three confirmations", () => {
    expect(computeConfidence({ ...base, confirms: 3 }).level).toBe("high");
  });

  it("decays to low after six hours without confirmation", () => {
    expect(computeConfidence({ ...base, ageMin: 360 }).level).toBe("low");
  });

  it("weighs a clear more than a confirmation", () => {
    const balanced = computeConfidence({ ...base, confirms: 1, clears: 1 });
    expect(balanced.score).toBeLessThan(computeConfidence(base).score);
  });

  it("caps confirmations so brigading stops mattering", () => {
    expect(computeConfidence({ ...base, confirms: 4 }).score).toBe(computeConfidence({ ...base, confirms: 40 }).score);
  });

  it("never exceeds bounds", () => {
    expect(computeConfidence({ ...base, confirms: 9, nearby: 9, hasPhoto: true, reputation: 0.9 }).score).toBe(100);
    expect(computeConfidence({ ...base, ageMin: 100_000, clears: 9 }).score).toBe(0);
  });

  it("explains itself", () => {
    const r = computeConfidence({ ...base, ageMin: 20, confirms: 2, hasPhoto: true, confirmedLater: true });
    expect(r.reasons).toEqual(["Last confirmed 20 min ago", "2 people confirmed", "Photo attached"]);
  });
});

describe("levelForScore", () => {
  it("uses the documented thresholds", () => {
    expect(levelForScore(69)).toBe("medium");
    expect(levelForScore(70)).toBe("high");
    expect(levelForScore(39)).toBe("low");
    expect(levelForScore(40)).toBe("medium");
  });
});
