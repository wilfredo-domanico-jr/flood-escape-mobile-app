import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { isSupabaseConfigured } from "@/lib/supabase/client";

type Health = { ok: boolean; detail: string };

async function fetchAuthHealth(): Promise<Health> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  const body = (await res.json()) as { version?: string };
  return { ok: true, detail: body.version ? `Auth ${body.version}` : "reachable" };
}

/** Phase-1 smoke check that the Supabase project is reachable through React Query. */
export function SupabaseStatus() {
  const query = useQuery({
    queryKey: ["health", "supabase"],
    queryFn: fetchAuthHealth,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });

  let tone = "bg-surface-muted";
  let label = "Supabase not configured";
  let detail = "Copy .env.example to .env and restart Expo.";

  if (isSupabaseConfigured) {
    if (query.isPending) {
      label = "Checking Supabase…";
      detail = "";
    } else if (query.data?.ok) {
      tone = "bg-brand-soft";
      label = "Supabase connected";
      detail = query.data.detail;
    } else {
      tone = "bg-severity-caution/15";
      label = "Supabase unreachable";
      detail = query.data?.detail ?? (query.error instanceof Error ? query.error.message : "");
    }
  }

  return (
    <View className={`mt-4 rounded-card p-4 ${tone}`} accessibilityRole="summary">
      <Text className="text-base font-semibold text-ink">{label}</Text>
      {detail ? <Text className="mt-1 text-sm text-ink-secondary">{detail}</Text> : null}
    </View>
  );
}
