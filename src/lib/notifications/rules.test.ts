import {
  DEFAULT_NOTIFICATION_PREFS,
  formatTimeOfDay,
  inQuietHours,
  notificationTimeBucket,
  parseTimeOfDay,
  wantsNotification,
} from "./rules";

describe("parseTimeOfDay / formatTimeOfDay", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeOfDay("23:00")).toBe(23 * 60);
    expect(parseTimeOfDay("06:30:00")).toBe(6 * 60 + 30);
    expect(parseTimeOfDay("7:05")).toBe(7 * 60 + 5);
  });
  it("tolerates garbage", () => {
    expect(parseTimeOfDay("")).toBe(0);
    expect(parseTimeOfDay("late")).toBe(0);
  });
  it("round-trips through format", () => {
    expect(formatTimeOfDay(parseTimeOfDay("23:15"))).toBe("23:15");
    expect(formatTimeOfDay(-60)).toBe("23:00");
    expect(formatTimeOfDay(1500)).toBe("01:00");
  });
});

describe("inQuietHours", () => {
  const at = (h: number, m = 0) => h * 60 + m;
  it("handles a window that wraps midnight", () => {
    expect(inQuietHours(at(23, 30), "23:00", "06:00")).toBe(true);
    expect(inQuietHours(at(2), "23:00", "06:00")).toBe(true);
    expect(inQuietHours(at(5, 59), "23:00", "06:00")).toBe(true);
    expect(inQuietHours(at(6), "23:00", "06:00")).toBe(false);
    expect(inQuietHours(at(14), "23:00", "06:00")).toBe(false);
    expect(inQuietHours(at(22, 59), "23:00", "06:00")).toBe(false);
  });
  it("handles a daytime window", () => {
    expect(inQuietHours(at(10), "09:00", "17:00")).toBe(true);
    expect(inQuietHours(at(17), "09:00", "17:00")).toBe(false);
    expect(inQuietHours(at(8, 59), "09:00", "17:00")).toBe(false);
  });
  it("treats start = end as no window", () => {
    expect(inQuietHours(at(12), "12:00", "12:00")).toBe(false);
  });
});

describe("wantsNotification", () => {
  const prefs = DEFAULT_NOTIFICATION_PREFS;
  const day = 14 * 60;
  const night = 2 * 60;
  it("is off when disabled", () => {
    expect(wantsNotification({ ...prefs, enabled: false }, "impassable", day)).toBe(false);
  });
  it("applies the severity threshold", () => {
    expect(wantsNotification(prefs, "passable", day)).toBe(false);
    expect(wantsNotification(prefs, "caution", day)).toBe(true);
    expect(wantsNotification({ ...prefs, minSeverity: "dangerous" }, "caution", day)).toBe(false);
    expect(wantsNotification({ ...prefs, minSeverity: "dangerous" }, "dangerous", day)).toBe(true);
  });
  it("silences quiet hours except impassable", () => {
    expect(wantsNotification(prefs, "dangerous", night)).toBe(false);
    expect(wantsNotification(prefs, "impassable", night)).toBe(true);
  });
});

describe("notificationTimeBucket", () => {
  it("changes every 30 minutes, matching the SQL floor(epoch/1800)", () => {
    const t = Date.UTC(2026, 8, 5, 6, 0, 0);
    expect(notificationTimeBucket(t)).toBe(Math.floor(t / 1000 / 1800));
    expect(notificationTimeBucket(t + 29 * 60_000)).toBe(notificationTimeBucket(t));
    expect(notificationTimeBucket(t + 30 * 60_000)).toBe(notificationTimeBucket(t) + 1);
  });
});
