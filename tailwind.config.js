/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Calm, high-contrast base palette.
        surface: {
          DEFAULT: "#F7F9FB",
          raised: "#FFFFFF",
          muted: "#EEF2F6",
          inverse: "#0F172A",
        },
        ink: {
          DEFAULT: "#0F172A",
          secondary: "#475569",
          muted: "#64748B",
          inverse: "#F8FAFC",
        },
        brand: {
          DEFAULT: "#0E7490",
          soft: "#CFFAFE",
        },
        // Severity. Always paired with an icon + label in the UI; never color alone.
        severity: {
          passable: "#2563EB",
          caution: "#D97706",
          dangerous: "#EA580C",
          impassable: "#B91C1C",
        },
        // Confidence pills.
        confidence: {
          high: "#15803D",
          medium: "#CA8A04",
          low: "#6B7280",
        },
        status: {
          offline: "#78716C",
          live: "#059669",
          stale: "#9CA3AF",
        },
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};
