/**
 * Database types. Hand-maintained to match `supabase/migrations`; regenerate with `npm run db:types`
 * (requires Docker + `npx supabase start`) and diff against this file.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type FloodSeverity = "passable" | "caution" | "dangerous" | "impassable";
type ReportStatus = "active" | "stale" | "resolved" | "disputed";
type VerificationKind = "confirm" | "clear";
type ConfidenceLevel = "low" | "medium" | "high";

type ProfileRow = {
  id: string;
  display_name: string | null;
  is_anonymous: boolean;
  reports_confirmed: number;
  reports_disputed: number;
  created_at: string;
  updated_at: string;
};

type FloodReportRow = {
  id: string;
  client_id: string;
  severity: FloodSeverity;
  status: ReportStatus;
  location: unknown;
  location_accuracy_m: number | null;
  geo_cell: string;
  description: string | null;
  has_photo: boolean;
  confirm_count: number;
  clear_count: number;
  nearby_report_count: number;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reasons: string[];
  created_at: string;
  last_confirmed_at: string;
  expires_at: string;
  resolved_at: string | null;
  updated_at: string;
};

type ReportAuthorRow = {
  report_id: string;
  user_id: string;
  reputation_snapshot: number;
  created_at: string;
};

type ReportMediaRow = {
  id: string;
  report_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
};

type ReportVerificationRow = {
  id: string;
  client_id: string;
  report_id: string;
  user_id: string;
  kind: VerificationKind;
  verifier_distance_m: number | null;
  comment: string | null;
  created_at: string;
};

type SavedRouteRow = {
  id: string;
  user_id: string;
  name: string;
  origin_label: string | null;
  destination_label: string | null;
  route_line: unknown;
  buffer_m: number;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

type PublicFloodReportRow = {
  id: string;
  severity: FloodSeverity;
  effective_status: ReportStatus;
  stored_status: ReportStatus;
  lat: number;
  lng: number;
  location_accuracy_m: number | null;
  geo_cell: string;
  description: string | null;
  has_photo: boolean;
  photo_path: string | null;
  confirm_count: number;
  clear_count: number;
  nearby_report_count: number;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reasons: string[];
  created_at: string;
  last_confirmed_at: string;
  expires_at: string;
  resolved_at: string | null;
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
      flood_reports: {
        Row: FloodReportRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      report_authors: {
        Row: ReportAuthorRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      report_media: {
        Row: ReportMediaRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      report_verifications: {
        Row: ReportVerificationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_routes: {
        Row: SavedRouteRow;
        Insert: never;
        Update: Partial<Pick<SavedRouteRow, "name" | "notify" | "buffer_m">>;
        Relationships: [];
      };
    };
    Views: {
      public_flood_reports: {
        Row: PublicFloodReportRow;
        Relationships: [];
      };
      my_reports: {
        Row: PublicFloodReportRow & { reporter_id: string };
        Relationships: [];
      };
      my_saved_routes: {
        Row: {
          id: string;
          name: string;
          origin_label: string | null;
          destination_label: string | null;
          buffer_m: number;
          notify: boolean;
          created_at: string;
          updated_at: string;
          route_geojson: Json;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_my_profile: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };
      reports_in_bbox: {
        Args: {
          p_min_lat: number;
          p_min_lng: number;
          p_max_lat: number;
          p_max_lng: number;
          p_include_stale?: boolean;
          p_limit?: number;
        };
        Returns: PublicFloodReportRow[];
      };
      create_flood_report: {
        Args: {
          p_client_id: string;
          p_lat: number;
          p_lng: number;
          p_severity: FloodSeverity;
          p_accuracy_m?: number;
          p_description?: string;
        };
        Returns: PublicFloodReportRow[];
      };
      attach_report_media: {
        Args: { p_report_id: string; p_storage_path: string; p_width?: number; p_height?: number; p_bytes?: number };
        Returns: undefined;
      };
      resolve_own_report: {
        Args: { p_report_id: string };
        Returns: PublicFloodReportRow[];
      };
      compute_confidence: {
        Args: {
          p_age_min: number;
          p_confirms: number;
          p_clears: number;
          p_nearby: number;
          p_has_photo: boolean;
          p_reputation: number;
          p_confirmed_later?: boolean;
        };
        Returns: { score: number; level: ConfidenceLevel; reasons: string[] }[];
      };
      verify_report: {
        Args: {
          p_client_id: string;
          p_report_id: string;
          p_kind: VerificationKind;
          p_lat?: number;
          p_lng?: number;
        };
        Returns: Json;
      };
      delete_my_data: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      reports_along_route: {
        Args: { p_route_geojson: string; p_buffer_m?: number };
        Returns: (PublicFloodReportRow & { distance_m: number })[];
      };
      save_route: {
        Args: { p_name: string; p_route_geojson: string; p_origin_label?: string; p_destination_label?: string };
        Returns: {
          id: string;
          name: string;
          origin_label: string | null;
          destination_label: string | null;
          notify: boolean;
          created_at: string;
        }[];
      };
      report_detail: {
        Args: { p_report_id: string };
        Returns: Json;
      };
      reports_near: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number; p_limit?: number };
        Returns: (PublicFloodReportRow & { distance_m: number })[];
      };
    };
    Enums: {
      flood_severity: FloodSeverity;
      report_status: ReportStatus;
      verification_kind: VerificationKind;
      confidence_level: ConfidenceLevel;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type Profile = Tables<"profiles">;
export type PublicReport = Views<"public_flood_reports">;
export type NearbyReport = PublicReport & { distance_m: number };
