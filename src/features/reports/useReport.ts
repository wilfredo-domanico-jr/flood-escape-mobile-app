import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";
import type { PublicReport } from "@/lib/supabase/database.types";

export type VerificationEvent = { kind: "confirm" | "clear"; created_at: string };

export type ReportDetail = {
  report: PublicReport;
  is_mine: boolean;
  my_verification: VerificationEvent | null;
  activity: VerificationEvent[];
};

export const reportQueryKey = (id: string) => ["report", id] as const;

async function fetchReportDetail(id: string): Promise<ReportDetail | null> {
  const { data, error } = await supabase.rpc("report_detail", { p_report_id: id });
  if (error) throw error;
  return (data as ReportDetail | null) ?? null;
}

/** Report details with an instant first paint from whatever list already holds the row. */
export function useReport(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reportQueryKey(id ?? ""),
    queryFn: () => fetchReportDetail(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    placeholderData: () => {
      if (!id) return undefined;
      const lists = queryClient.getQueriesData<PublicReport[]>({ queryKey: ["reports"] });
      for (const [, rows] of lists) {
        const hit = rows?.find((r) => r.id === id);
        if (hit) return { report: hit, is_mine: false, my_verification: null, activity: [] } satisfies ReportDetail;
      }
      return undefined;
    },
  });
}

export function useResolveOwnReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("resolve_own_report", { p_report_id: id });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
