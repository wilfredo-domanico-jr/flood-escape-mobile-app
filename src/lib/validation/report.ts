import { SEVERITIES, type Severity } from "@/constants/severity";

/** Server enforces the same box in a CHECK constraint and in create_flood_report(). */
export const REGION_BOUNDS = { minLat: 4, maxLat: 22, minLng: 116, maxLng: 127 };
export const MAX_DESCRIPTION_LENGTH = 500;

export type ReportDraft = {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  severity: Severity | null;
  description: string;
};

export type ReportInput = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  severity: Severity;
  description: string | null;
};

export type ReportValidation =
  | { ok: true; value: ReportInput }
  | { ok: false; errors: Partial<Record<"location" | "severity" | "description", string>> };

export function isInsideRegion(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= REGION_BOUNDS.minLat &&
    lat <= REGION_BOUNDS.maxLat &&
    lng >= REGION_BOUNDS.minLng &&
    lng <= REGION_BOUNDS.maxLng
  );
}

export function validateReportDraft(draft: ReportDraft): ReportValidation {
  const errors: Partial<Record<"location" | "severity" | "description", string>> = {};

  if (draft.lat == null || draft.lng == null) {
    errors.location = "Place the pin where the flooding is.";
  } else if (!isInsideRegion(draft.lat, draft.lng)) {
    errors.location = "The pin must be inside the Philippines.";
  }

  if (!draft.severity || !SEVERITIES.includes(draft.severity)) {
    errors.severity = "Pick how bad the flooding is.";
  }

  const description = draft.description.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  if (draft.accuracyM != null && (!Number.isFinite(draft.accuracyM) || draft.accuracyM < 0)) {
    // Accuracy is informational; a bad value is dropped rather than blocking the report.
    draft = { ...draft, accuracyM: null };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      lat: draft.lat as number,
      lng: draft.lng as number,
      accuracyM: draft.accuracyM,
      severity: draft.severity as Severity,
      description: description.length ? description : null,
    },
  };
}
