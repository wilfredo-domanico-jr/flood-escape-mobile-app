/**
 * Notification rules, mirrored from supabase/migrations/20260905000100_notifications.sql
 * (severity_rank, in_quiet_hours, wants_notification, notification_time_bucket). The server is
 * authoritative; the app uses these to explain settings and to preview what would be sent.
 */

export type NotificationSeverity = "passable" | "caution" | "dangerous" | "impassable";

export type NotificationPrefs = {
  enabled: boolean;
  minSeverity: NotificationSeverity;
  /** "HH:MM" in Manila local time. */
  quietStart: string;
  quietEnd: string;
  notifyCleared: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  minSeverity: "caution",
  quietStart: "23:00",
  quietEnd: "06:00",
  notifyCleared: false,
};

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  passable: 0,
  caution: 1,
  dangerous: 2,
  impassable: 3,
};

/** "HH:MM" or "HH:MM:SS" to minutes since midnight. Invalid input yields 0. */
export function parseTimeOfDay(value: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function formatTimeOfDay(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Whether `localMinutes` falls inside [start, end); the window may wrap midnight. start = end means no window. */
export function inQuietHours(localMinutes: number, start: string, end: string): boolean {
  const s = parseTimeOfDay(start);
  const e = parseTimeOfDay(end);
  const t = ((localMinutes % 1440) + 1440) % 1440;
  if (s === e) return false;
  if (s < e) return t >= s && t < e;
  return t >= s || t < e;
}

/** Same decision the server makes: on, severe enough, and not silenced (impassable always gets through). */
export function wantsNotification(prefs: NotificationPrefs, severity: NotificationSeverity, localMinutes: number): boolean {
  if (!prefs.enabled) return false;
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[prefs.minSeverity]) return false;
  return severity === "impassable" || !inQuietHours(localMinutes, prefs.quietStart, prefs.quietEnd);
}

/** 30-minute bucket used for the one-push-per-route throttle. */
export function notificationTimeBucket(epochMs: number): number {
  return Math.floor(epochMs / 1000 / 1800);
}

/** Minutes since midnight in the device's local time zone. */
export function localMinutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
