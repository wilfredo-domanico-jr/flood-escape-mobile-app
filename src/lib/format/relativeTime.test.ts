import { ageMinutes, formatAge, formatUntil } from "./relativeTime";

const NOW = Date.parse("2026-09-04T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

describe("formatAge", () => {
  it.each([
    [0.5, "just now"],
    [1, "1 min ago"],
    [45, "45 min ago"],
    [72, "1.2 h ago"],
    [11 * 60 + 30, "11 h ago"],
    [26 * 60, "1 d ago"],
  ])("%p minutes ago -> %p", (mins, expected) => {
    expect(formatAge(at(mins), NOW)).toBe(expected);
  });

  it("never shows negative ages for clock skew", () => {
    expect(formatAge(at(-5), NOW)).toBe("just now");
  });

  it("handles invalid input", () => {
    expect(formatAge("nope", NOW)).toBe("unknown time");
    expect(ageMinutes("nope", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("ageMinutes", () => {
  it("returns elapsed minutes", () => {
    expect(ageMinutes(at(90), NOW)).toBeCloseTo(90);
  });
});

describe("formatUntil", () => {
  it("formats future and past", () => {
    expect(formatUntil(at(-30), NOW)).toBe("in 30 min");
    expect(formatUntil(at(-150), NOW)).toBe("in 2.5 h");
    expect(formatUntil(at(1), NOW)).toBe("expired");
  });
});
