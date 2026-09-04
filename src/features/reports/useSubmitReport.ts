import * as Crypto from "expo-crypto";
import { useCallback, useState } from "react";

import { type ReportPayload, sqliteOutbox } from "@/features/offline/outbox";
import { syncOutbox } from "@/features/offline/syncOutbox";
import { compressPhoto, stashPhotoForOutbox } from "@/lib/media/compressPhoto";
import type { ReportInput } from "@/lib/validation/report";
import { useAppStore } from "@/store/useAppStore";

import type { PickedPhoto } from "./PhotoPicker";

export type SubmitOutcome = { clientId: string; queuedOffline: boolean };

/**
 * The only way a report leaves the phone: compress → stash → enqueue → kick the outbox.
 * Online and offline take the same path; online simply drains immediately.
 */
export function useSubmitReport() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: ReportInput, photo: PickedPhoto | null): Promise<SubmitOutcome | null> => {
    setSubmitting(true);
    setError(null);
    const clientId = Crypto.randomUUID();
    try {
      let photoUri: string | null = null;
      let photoMeta: ReportPayload["photo"] = null;
      if (photo) {
        const compressed = await compressPhoto(photo.uri, { width: photo.width, height: photo.height });
        photoUri = stashPhotoForOutbox(compressed.uri, clientId);
        photoMeta = { width: compressed.width, height: compressed.height };
      }
      const payload: ReportPayload = {
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        severity: input.severity,
        description: input.description,
        photo: photoMeta,
      };
      await sqliteOutbox.insert({
        clientId,
        kind: "report",
        payload: JSON.stringify(payload),
        photoUri,
        reportId: null,
        status: "pending",
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        createdAt: Date.now(),
      });
      const online = useAppStore.getState().isOnline;
      // Fire and forget: the map shows a "Sending…" pin and the runner handles retries.
      void syncOutbox();
      return { clientId, queuedOffline: !online };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the report.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error };
}
