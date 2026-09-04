import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { colors } from "@/constants/theme";
import { signOut } from "@/features/auth/api";
import { supabase } from "@/lib/supabase/client";
import { usePrefsStore } from "@/store/usePrefsStore";

function Row({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-card bg-surface-raised p-4">
      <View className="flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-ink-secondary">{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand }}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const blur = usePrefsStore((s) => s.blurMyLocation);
  const wifiOnly = usePrefsStore((s) => s.wifiOnlyPhotos);
  const setPref = usePrefsStore((s) => s.set);
  const [busy, setBusy] = useState(false);

  const confirmDelete = () =>
    Alert.alert(
      "Delete my data?",
      "Your reports, photos and verifications are removed for everyone and you get a fresh anonymous account. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              // Photos first (Storage API), then rows. Orphaned photos would otherwise linger.
              const { data: mine } = await supabase.from("my_reports").select("photo_path");
              const paths = (mine ?? []).map((r) => r.photo_path).filter((x): x is string => Boolean(x));
              if (paths.length > 0) {
                const { error: rmError } = await supabase.storage.from("report-photos").remove(paths);
                if (rmError) throw rmError;
              }
              const { error } = await supabase.rpc("delete_my_data");
              if (error) throw error;
              await signOut();
              queryClient.clear();
              router.replace("/(tabs)");
            } catch (e) {
              Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again later.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="gap-3 px-5 py-4">
      <Text className="text-sm leading-5 text-ink-secondary">
        Other users never see who reported or verified anything. These settings control what leaves your phone.
      </Text>
      <Row
        title="Blur my report locations"
        body="Rounds the pin to about 100 m before sending. Slightly less precise for others, but never a doorstep."
        value={blur}
        onChange={(v) => void setPref("blurMyLocation", v)}
      />
      <Row
        title="Upload photos on Wi-Fi only"
        body="Reports always send immediately. Photos wait for Wi-Fi to save mobile data."
        value={wifiOnly}
        onChange={(v) => void setPref("wifiOnlyPhotos", v)}
      />
      <View className="mt-4 gap-2 rounded-card bg-surface-raised p-4">
        <Text className="text-base font-semibold text-ink">Photos and metadata</Text>
        <Text className="text-sm leading-5 text-ink-secondary">
          Photos are resized and re-encoded on your phone before upload, which strips camera metadata such as
          GPS position and device model. Uploads are capped at 2 MB.
        </Text>
      </View>
      <View className="mt-4 gap-2">
        <Button title="Delete my data" variant="danger" onPress={confirmDelete} loading={busy} />
        <Text className="text-center text-xs text-ink-muted">
          Removes your reports, photos and verifications. Resolved reports are otherwise deleted after 30 days.
        </Text>
      </View>
    </ScrollView>
  );
}
