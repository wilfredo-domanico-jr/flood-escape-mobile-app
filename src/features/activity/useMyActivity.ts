import { useQuery } from "@tanstack/react-query";

import { selectUser, useAuthStore } from "@/features/auth/authStore";
import { supabase } from "@/lib/supabase/client";
import type { Database, PublicReport } from "@/lib/supabase/database.types";

export type MyReport = Database["public"]["Views"]["my_reports"]["Row"];
export type MyVerification = Database["public"]["Tables"]["report_verifications"]["Row"] & {
  report: PublicReport | null;
};

export const myReportsKey = (uid: string | null) => ["me", "reports", uid] as const;
export const myVerificationsKey = (uid: string | null) => ["me", "verifications", uid] as const;

export function useMyReports() {
  const user = useAuthStore(selectUser);
  return useQuery({
    queryKey: myReportsKey(user?.id ?? null),
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("my_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as MyReport[];
    },
  });
}

export function useMyVerifications() {
  const user = useAuthStore(selectUser);
  return useQuery({
    queryKey: myVerificationsKey(user?.id ?? null),
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_verifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set(data.map((v) => v.report_id))];
      const reports = ids.length
        ? (await supabase.from("public_flood_reports").select("*").in("id", ids)).data ?? []
        : [];
      const byId = new Map(reports.map((r) => [r.id, r]));
      return data.map((v) => ({ ...v, report: byId.get(v.report_id) ?? null })) as MyVerification[];
    },
  });
}
