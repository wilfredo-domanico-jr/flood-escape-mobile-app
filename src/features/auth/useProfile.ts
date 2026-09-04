import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/database.types";

import { selectUser, useAuthStore } from "./authStore";

export const profileQueryKey = (userId: string | null) => ["me", "profile", userId] as const;

async function fetchMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw error;
  return data ?? null;
}

export function useProfile() {
  const user = useAuthStore(selectUser);
  return useQuery({
    queryKey: profileQueryKey(user?.id ?? null),
    queryFn: fetchMyProfile,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
}
