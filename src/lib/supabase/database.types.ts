/**
 * Database types. Hand-maintained to match `supabase/migrations` until the local stack is
 * available, then regenerate with `npm run db:types` (requires Docker + `npx supabase start`).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProfileRow = {
  id: string;
  display_name: string | null;
  is_anonymous: boolean;
  reports_confirmed: number;
  reports_disputed: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_profile: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };
    };
    Enums: {
      flood_severity: "passable" | "caution" | "dangerous" | "impassable";
      report_status: "active" | "stale" | "resolved" | "disputed";
      verification_kind: "confirm" | "clear";
      confidence_level: "low" | "medium" | "high";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type Profile = Tables<"profiles">;
