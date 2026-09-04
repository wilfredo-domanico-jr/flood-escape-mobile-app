const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function ageMinutes(iso: string, now: number = Date.now()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - t) / MINUTE);
}

/** "just now", "12 min ago", "2 h ago", "1 d ago". Short on purpose: it sits inside map cards. */
export function formatAge(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown time";
  const diff = Math.max(0, now - t);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const hours = diff / HOUR;
    return hours < 10 ? `${Math.round(hours * 10) / 10} h ago` : `${Math.floor(hours)} h ago`;
  }
  return `${Math.floor(diff / DAY)} d ago`;
}

/** "in 2 h", "in 35 min", or "expired". */
export function formatUntil(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = t - now;
  if (diff <= 0) return "expired";
  if (diff < HOUR) return `in ${Math.max(1, Math.floor(diff / MINUTE))} min`;
  return `in ${Math.round((diff / HOUR) * 10) / 10} h`;
}
