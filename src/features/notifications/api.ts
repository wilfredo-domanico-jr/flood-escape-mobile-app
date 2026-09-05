import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, type NotificationSeverity } from "@/lib/notifications/rules";
import { supabase } from "@/lib/supabase/client";

type PrefsRow = {
  enabled: boolean;
  min_severity: NotificationSeverity;
  quiet_start: string;
  quiet_end: string;
  notify_cleared: boolean;
};

const fromRow = (r: PrefsRow): NotificationPrefs => ({
  enabled: r.enabled,
  minSeverity: r.min_severity,
  quietStart: r.quiet_start.slice(0, 5),
  quietEnd: r.quiet_end.slice(0, 5),
  notifyCleared: r.notify_cleared,
});

/** The caller's row (RLS scopes the select). Defaults if the row is somehow missing. */
export async function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("enabled, min_severity, quiet_start, quiet_end, notify_cleared")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as PrefsRow) : DEFAULT_NOTIFICATION_PREFS;
}

export async function saveNotificationPrefs(p: NotificationPrefs): Promise<NotificationPrefs> {
  const { data, error } = await supabase.rpc("set_notification_preferences", {
    p_enabled: p.enabled,
    p_min_severity: p.minSeverity,
    p_quiet_start: p.quietStart,
    p_quiet_end: p.quietEnd,
    p_notify_cleared: p.notifyCleared,
  });
  if (error) throw error;
  return fromRow(data as PrefsRow);
}

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<void> {
  const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: platform });
  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc("unregister_push_token", { p_token: token });
  if (error) throw error;
}
