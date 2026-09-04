import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { LocationPermission } from "@/hooks/useLocation";

import { Button } from "./Button";

type Props = {
  permission: LocationPermission;
  onRequest: () => void;
  /** Short explanation of why this screen needs location. */
  reason: string;
  compact?: boolean;
};

/** Contextual location prompt. Rendered where location is needed, never on launch. */
export function LocationPermissionCard({ permission, onRequest, reason, compact }: Props) {
  if (permission === "granted") return null;

  const blocked = permission === "blocked";
  return (
    <View className={`rounded-card bg-surface-raised ${compact ? "p-3" : "p-4"} shadow-sm`}>
      <View className="flex-row items-center gap-2">
        <Ionicons name="locate-outline" size={20} color={colors.brand} />
        <Text className="flex-1 text-base font-semibold text-ink">
          {blocked ? "Location is turned off" : "Use your location?"}
        </Text>
      </View>
      <Text className="mt-1 text-sm leading-5 text-ink-secondary">
        {blocked
          ? "Enable location for Flood Escape in your phone settings to see what's near you."
          : reason}
      </Text>
      <Button
        title={blocked ? "Open settings" : "Enable location"}
        variant={compact ? "secondary" : "primary"}
        className="mt-3"
        onPress={onRequest}
      />
    </View>
  );
}
