import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

import { colors } from "@/constants/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
type TabIconProps = { color: ColorValue; focused: boolean; size: number };

function tabIcon(focused: IconName, unfocused: IconName) {
  function TabIcon({ color, focused: isFocused, size }: TabIconProps) {
    return <Ionicons name={isFocused ? focused : unfocused} color={color} size={size} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Map", tabBarIcon: tabIcon("map", "map-outline") }} />
      <Tabs.Screen
        name="route"
        options={{ title: "Route", tabBarIcon: tabIcon("navigate", "navigate-outline") }}
      />
      <Tabs.Screen
        name="centers"
        options={{ title: "Centers", tabBarIcon: tabIcon("medkit", "medkit-outline") }}
      />
      <Tabs.Screen name="you" options={{ title: "You", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
