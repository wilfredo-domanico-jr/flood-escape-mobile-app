import type { Enums } from "@/lib/supabase/database.types";

import { colors } from "./theme";

export type Severity = Enums<"flood_severity">;
export type ReportStatus = Enums<"report_status">;
export type ConfidenceLevel = Enums<"confidence_level">;

export const SEVERITIES: readonly Severity[] = ["passable", "caution", "dangerous", "impassable"];

/** Ionicons names; every severity pairs an icon with its color so color is never the only cue. */
export const SEVERITY_META: Record<
  Severity,
  { label: string; short: string; help: string; icon: "car-outline" | "alert-circle-outline" | "warning-outline" | "close-circle-outline"; color: string }
> = {
  passable: {
    label: "Passable",
    short: "Passable",
    help: "Water on the road, but vehicles are getting through.",
    icon: "car-outline",
    color: colors.severity.passable,
  },
  caution: {
    label: "Caution",
    short: "Caution",
    help: "Ankle to shin deep. Slow down; risky for motorcycles.",
    icon: "alert-circle-outline",
    color: colors.severity.caution,
  },
  dangerous: {
    label: "Dangerous",
    short: "Dangerous",
    help: "Knee deep or fast-moving. Most vehicles should turn back.",
    icon: "warning-outline",
    color: colors.severity.dangerous,
  },
  impassable: {
    label: "Impassable",
    short: "Impassable",
    help: "Waist deep or worse. Nothing is getting through.",
    icon: "close-circle-outline",
    color: colors.severity.impassable,
  },
};

export const SEVERITY_RANK: Record<Severity, number> = {
  passable: 0,
  caution: 1,
  dangerous: 2,
  impassable: 3,
};

export const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; summary: string; color: string }> = {
  high: {
    label: "High confidence",
    summary: "Multiple recent reports confirm flooding.",
    color: colors.confidence.high,
  },
  medium: {
    label: "Medium confidence",
    summary: "Recently reported, but limited confirmation.",
    color: colors.confidence.medium,
  },
  low: {
    label: "Low confidence",
    summary: "Old report or conflicting reports.",
    color: colors.confidence.low,
  },
};

export const STATUS_META: Record<ReportStatus, { label: string; hint: string }> = {
  active: { label: "Active", hint: "Reported recently or recently confirmed." },
  stale: { label: "May have receded", hint: "No confirmation for a while. Treat with care." },
  disputed: { label: "Disputed", hint: "People disagree about whether it is still flooded." },
  resolved: { label: "Cleared", hint: "Marked as no longer flooded." },
};
