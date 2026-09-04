import type { Transport } from "@/features/offline/drainOutbox";
import type { ReportPayload } from "@/features/offline/outbox";
import { deleteStashedPhoto, readPhotoBytes } from "@/lib/media/compressPhoto";
import { supabase } from "@/lib/supabase/client";
import type { PublicReport } from "@/lib/supabase/database.types";

export const PHOTO_BUCKET = "report-photos";

export const photoPathFor = (reportId: string) => `reports/${reportId}.jpg`;

export function photoUrlFor(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createFloodReport(clientId: string, p: ReportPayload): Promise<PublicReport> {
  const { data, error } = await supabase.rpc("create_flood_report", {
    p_client_id: clientId,
    p_lat: p.lat,
    p_lng: p.lng,
    p_severity: p.severity,
    p_accuracy_m: p.accuracyM ?? undefined,
    p_description: p.description ?? undefined,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("create_flood_report returned no row");
  return row;
}

export async function uploadReportPhoto(reportId: string, uri: string): Promise<{ bytes: number | null }> {
  const { bytes, size } = await readPhotoBytes(uri);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(photoPathFor(reportId), bytes, { contentType: "image/jpeg", upsert: false });
  // A retry after a successful upload sees "already exists"; that is success for our purposes.
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  return { bytes: size };
}

export async function attachReportMedia(
  reportId: string,
  meta: { width: number | null; height: number | null; bytes: number | null },
): Promise<void> {
  const { error } = await supabase.rpc("attach_report_media", {
    p_report_id: reportId,
    p_storage_path: photoPathFor(reportId),
    p_width: meta.width ?? undefined,
    p_height: meta.height ?? undefined,
    p_bytes: meta.bytes ?? undefined,
  });
  if (error) throw error;
}

/** Outbox transport backed by Supabase. */
export const supabaseTransport: Transport = {
  async createReport(clientId, payload) {
    const row = await createFloodReport(clientId, payload);
    return { id: row.id };
  },
  uploadPhoto: uploadReportPhoto,
  attachMedia: attachReportMedia,
  async verify(clientId, payload) {
    const { error } = await supabase.rpc("verify_report", {
      p_client_id: clientId,
      p_report_id: payload.reportId,
      p_kind: payload.kind,
      p_lat: payload.lat ?? undefined,
      p_lng: payload.lng ?? undefined,
    });
    if (error) throw error;
  },
  discardPhoto: deleteStashedPhoto,
};
