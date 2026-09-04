/**
 * Color tokens mirrored from tailwind.config.js for the few places that need raw values
 * (navigation options, map markers). Keep both in sync.
 */
export const colors = {
  surface: "#F7F9FB",
  surfaceRaised: "#FFFFFF",
  ink: "#0F172A",
  inkSecondary: "#475569",
  inkMuted: "#64748B",
  brand: "#0E7490",
  severity: {
    passable: "#2563EB",
    caution: "#D97706",
    dangerous: "#EA580C",
    impassable: "#B91C1C",
  },
  confidence: {
    high: "#15803D",
    medium: "#CA8A04",
    low: "#6B7280",
  },
} as const;
