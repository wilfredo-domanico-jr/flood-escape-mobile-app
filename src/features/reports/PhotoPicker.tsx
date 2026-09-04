import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { colors } from "@/constants/theme";

export type PickedPhoto = { uri: string; width: number; height: number };

type Props = {
  value: PickedPhoto | null;
  onChange: (p: PickedPhoto | null) => void;
};

export function PhotoPicker({ value, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const handle = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    onChange({ uri: a.uri, width: a.width, height: a.height });
  };

  const takePhoto = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera access is off. You can still pick a photo from your library.");
      return;
    }
    // exif is off by default and the photo is re-encoded before upload, so no metadata leaves the phone.
    handle(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, exif: false }));
  };

  const pickPhoto = async () => {
    setError(null);
    handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, exif: false }));
  };

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink-secondary">Photo (optional)</Text>
      {value ? (
        <View className="flex-row items-center gap-3">
          <Image source={{ uri: value.uri }} style={{ width: 88, height: 88, borderRadius: 12 }} contentFit="cover" />
          <View className="flex-1 gap-2">
            <Text className="text-sm text-ink-secondary">Photos help others trust the report.</Text>
            <Pressable
              onPress={() => onChange(null)}
              accessibilityRole="button"
              className="flex-row items-center gap-1 self-start"
            >
              <Ionicons name="trash-outline" size={16} color={colors.severity.impassable} />
              <Text className="text-sm font-semibold text-severity-impassable">Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button title="Take photo" variant="secondary" className="flex-1" onPress={takePhoto} />
          <Button title="Choose photo" variant="secondary" className="flex-1" onPress={pickPhoto} />
        </View>
      )}
      {error ? <Text className="text-sm text-ink-secondary">{error}</Text> : null}
    </View>
  );
}
