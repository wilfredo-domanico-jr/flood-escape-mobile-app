import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, type CameraRef, UserLocation } from "@maplibre/maplibre-react-native";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccuracyCircle } from "@/components/map/AccuracyCircle";
import { AppMap } from "@/components/map/AppMap";
import { DraggablePinMarker } from "@/components/map/PinMarker";
import { Button } from "@/components/ui/Button";
import { LocationPermissionCard } from "@/components/ui/PermissionGate";
import { TextField } from "@/components/ui/TextField";
import type { Severity } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { DEFAULT_REGION, DEFAULT_ZOOM, PIN_ZOOM, POOR_ACCURACY_M } from "@/constants/thresholds";
import { fetchReportsNear } from "@/features/map/api";
import { useLocation } from "@/hooks/useLocation";
import { formatAge } from "@/lib/format/relativeTime";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { MAX_DESCRIPTION_LENGTH, validateReportDraft } from "@/lib/validation/report";
import { useAppStore } from "@/store/useAppStore";

import { PhotoPicker, type PickedPhoto } from "./PhotoPicker";
import { SEVERITY_META } from "@/constants/severity";
import { SeverityPicker } from "./SeverityPicker";
import { useSubmitReport } from "./useSubmitReport";

const DUPLICATE_RADIUS_M = 50;

export function NewReportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraRef>(null);
  const isOnline = useAppStore((s) => s.isOnline);
  const { permission, fix, request, busy: locating } = useLocation();
  const { submit, submitting, error: submitError } = useSubmitReport();

  // The pin follows the GPS until the user places it by hand.
  const [manualPin, setManualPin] = useState<{ lat: number; lng: number } | null>(null);
  const pinMoved = manualPin !== null;
  const pin = manualPin ?? (fix ? { lat: fix.lat, lng: fix.lng } : null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ location?: string; severity?: string; description?: string }>({});
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);

  // Keep the map on the GPS fix until the user takes over.
  useEffect(() => {
    if (!fix || pinMoved) return;
    cameraRef.current?.easeTo({ center: [fix.lng, fix.lat], zoom: PIN_ZOOM, duration: 300 });
  }, [fix, pinMoved]);

  // Someone may have reported this exact spot already; offer to confirm instead.
  const dupKey = pin ? `${pin.lat.toFixed(4)},${pin.lng.toFixed(4)}` : null;
  const duplicate = useQuery({
    queryKey: ["reports", "duplicate", dupKey],
    queryFn: () => fetchReportsNear(pin!.lat, pin!.lng, DUPLICATE_RADIUS_M),
    enabled: Boolean(pin) && isOnline && isSupabaseConfigured,
    staleTime: 30_000,
  });
  const existing = useMemo(
    () => duplicate.data?.find((r) => r.effective_status === "active" || r.effective_status === "disputed") ?? null,
    [duplicate.data],
  );

  const accuracy = fix?.accuracyM ?? null;
  const poorAccuracy = accuracy != null && accuracy > POOR_ACCURACY_M;

  const onSubmit = async () => {
    const result = validateReportDraft({
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      accuracyM: pinMoved ? null : accuracy,
      severity,
      description,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const outcome = await submit(result.value, photo);
    if (!outcome) return;
    if (outcome.queuedOffline) {
      Alert.alert("Saved", "You're offline. We'll send this report as soon as you're back online.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const canSubmit = Boolean(pin && severity) && !submitting;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-1 bg-surface">
        <View
          className="flex-row items-center justify-between px-4 pb-2"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Text className="text-2xl font-bold text-ink">Report flooding</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted"
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="gap-5 px-4 pb-32" keyboardShouldPersistTaps="handled">
          {/* Location */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink-secondary">Where is the water?</Text>
            <View className="overflow-hidden rounded-card" style={{ height: 220 }}>
              <AppMap
                style={{ flex: 1 }}
                onPress={(e) => {
                  const [lng, lat] = e.nativeEvent.lngLat;
                  setManualPin({ lat, lng });
                }}
                accessibilityLabel="Map for placing the flood pin"
              >
                <Camera
                  ref={cameraRef}
                  initialViewState={
                    fix
                      ? { center: [fix.lng, fix.lat], zoom: PIN_ZOOM }
                      : { center: [DEFAULT_REGION.longitude, DEFAULT_REGION.latitude], zoom: DEFAULT_ZOOM }
                  }
                />
                {permission === "granted" ? <UserLocation /> : null}
                {fix && accuracy != null && accuracy > 20 && !pinMoved ? (
                  <AccuracyCircle center={{ lat: fix.lat, lng: fix.lng }} radiusM={accuracy} />
                ) : null}
                {pin ? (
                  <DraggablePinMarker
                    at={pin}
                    color={severity ? SEVERITY_META[severity].color : colors.brand}
                    onDragEnd={setManualPin}
                    accessibilityLabel="Flood location pin. Drag to adjust."
                  />
                ) : null}
              </AppMap>
            </View>
            {permission !== "granted" ? (
              <LocationPermissionCard
                permission={permission}
                onRequest={request}
                reason="We use your location to place the pin. You can also tap the map to place it by hand."
                compact
              />
            ) : locating && !pin ? (
              <Text className="text-sm text-ink-secondary">Finding your location…</Text>
            ) : pinMoved ? (
              <Text className="text-sm text-ink-secondary">Pin placed by hand. Drag it or tap the map to adjust.</Text>
            ) : poorAccuracy ? (
              <Text className="text-sm text-severity-caution">
                GPS accuracy ±{Math.round(accuracy!)} m. Drag the pin to the flooded spot.
              </Text>
            ) : accuracy != null ? (
              <Text className="text-sm text-ink-secondary">GPS accuracy ±{Math.round(accuracy)} m. Drag the pin if needed.</Text>
            ) : null}
            {errors.location ? <Text className="text-sm text-severity-impassable">{errors.location}</Text> : null}
          </View>

          {existing && !dismissedDuplicate ? (
            <View className="gap-2 rounded-card bg-brand-soft p-3">
              <Text className="text-base font-semibold text-ink">
                Someone reported {SEVERITY_META[existing.severity].label.toLowerCase()} flooding here{" "}
                {formatAge(existing.last_confirmed_at)}.
              </Text>
              <Text className="text-sm text-ink-secondary">
                Confirming their report is faster and makes it more trustworthy than adding another one.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  title="Confirm it instead"
                  className="flex-1"
                  onPress={() => router.replace({ pathname: "/report/[id]", params: { id: existing.id } })}
                />
                <Button title="Report anyway" variant="secondary" className="flex-1" onPress={() => setDismissedDuplicate(true)} />
              </View>
            </View>
          ) : null}

          <SeverityPicker value={severity} onChange={setSeverity} error={errors.severity} />

          <PhotoPicker value={photo} onChange={setPhoto} />

          <TextField
            label="What do you see? (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Knee-deep near the pedestrian bridge, jeepneys turning back"
            multiline
            numberOfLines={3}
            maxLength={MAX_DESCRIPTION_LENGTH + 50}
            error={errors.description}
            hint={`${description.trim().length}/${MAX_DESCRIPTION_LENGTH}`}
            style={{ minHeight: 88, textAlignVertical: "top" }}
          />

          {submitError ? <Text className="text-sm text-severity-impassable">{submitError}</Text> : null}
        </ScrollView>

        <View
          className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-surface px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {!isOnline ? (
            <Text className="mb-2 text-center text-xs text-ink-muted">
              Offline. The report will be saved and sent automatically later.
            </Text>
          ) : null}
          <Button
            title={isOnline ? "Submit report" : "Save report"}
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
