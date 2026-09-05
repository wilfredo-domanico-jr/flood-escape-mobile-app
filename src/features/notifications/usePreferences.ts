import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/features/auth/authStore";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@/lib/notifications/rules";
import { isSupabaseConfigured } from "@/lib/supabase/client";

import { fetchNotificationPrefs, saveNotificationPrefs } from "./api";

export const notificationPrefsKey = ["me", "notification-prefs"] as const;

export function useNotificationPrefs() {
  const hasSession = useAuthStore((s) => Boolean(s.session));
  return useQuery({
    queryKey: notificationPrefsKey,
    queryFn: fetchNotificationPrefs,
    enabled: isSupabaseConfigured && hasSession,
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_NOTIFICATION_PREFS,
  });
}

/** Optimistic: the switch flips immediately and rolls back if the server refuses. */
export function useSaveNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveNotificationPrefs,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: notificationPrefsKey });
      const previous = queryClient.getQueryData<NotificationPrefs>(notificationPrefsKey);
      queryClient.setQueryData(notificationPrefsKey, next);
      return { previous };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(notificationPrefsKey, ctx.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(notificationPrefsKey, saved),
  });
}
