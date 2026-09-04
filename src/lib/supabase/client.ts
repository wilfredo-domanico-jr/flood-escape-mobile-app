// Provides a SQLite-backed `localStorage` so Supabase Auth persists sessions across launches.
// This is Expo's recommended storage adapter for SDK 57 (no AsyncStorage needed).
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import type { Database } from "./database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False until `.env` is filled in. The UI shows a setup hint instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes("your-project-ref"));

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env.",
  );
}

export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder",
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps have no URL to read a session from.
      detectSessionInUrl: false,
    },
  },
);

// Only run the token refresh loop while the app is in the foreground (battery + correctness).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
