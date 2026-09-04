import { isInsideRegion, MAX_DESCRIPTION_LENGTH, validateReportDraft } from "./report";

const good = { lat: 14.6, lng: 121.1, accuracyM: 12, severity: "caution" as const, description: "  ankle deep  " };

describe("validateReportDraft", () => {
  it("accepts a complete draft and trims the description", () => {
    const res = validateReportDraft(good);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.description).toBe("ankle deep");
      expect(res.value.severity).toBe("caution");
    }
  });

  it("turns an empty description into null", () => {
    const res = validateReportDraft({ ...good, description: "   " });
    expect(res.ok && res.value.description).toBeNull();
  });

  it("requires a location", () => {
    const res = validateReportDraft({ ...good, lat: null, lng: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.location).toBeTruthy();
  });

  it("rejects coordinates outside the region", () => {
    const res = validateReportDraft({ ...good, lat: 51.5, lng: -0.1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.location).toMatch(/Philippines/);
  });

  it("requires a severity", () => {
    const res = validateReportDraft({ ...good, severity: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.severity).toBeTruthy();
  });

  it("caps description length", () => {
    const res = validateReportDraft({ ...good, description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.description).toBeTruthy();
  });

  it("drops a nonsensical accuracy instead of failing", () => {
    const res = validateReportDraft({ ...good, accuracyM: -5 });
    expect(res.ok && res.value.accuracyM).toBeNull();
  });
});

describe("isInsideRegion", () => {
  it("bounds the Philippines", () => {
    expect(isInsideRegion(14.6, 121.0)).toBe(true);
    expect(isInsideRegion(0, 0)).toBe(false);
    expect(isInsideRegion(Number.NaN, 121)).toBe(false);
  });
});
