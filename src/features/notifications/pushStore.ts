import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { create } from "zustand";

import { registerPushToken } from "./api";
import { ensureAndroidChannel, getExpoPushToken, getPushPermission, type PushPermission, requestPushPermission } from "./push";

const REGISTERED_KEY = "push.registered.v1";
const REREGISTER_AFTER_MS = 24 * 60 * 60_000;

type PushState = {
  permission: PushPermission | "unknown";
  token: string | null;
  /** Why no token could be obtained, in words the settings screen can show. */
  tokenError: string | null;
  busy: boolean;
  refreshPermission: () => Promise<PushPermission>;
  /** Registers the token when permission is already granted. Cheap to call often. */
  registerIfAllowed: () => Promise<boolean>;
  /** Asks the OS, then registers. Use only from a contextual prompt. */
  requestAndRegister: () => Promise<boolean>;
};

async function alreadyRegistered(token: string): Promise<boolean> {
  try {
    const raw = await Storage.getItem(REGISTERED_KEY);
    if (!raw) return false;
    const { token: t, at } = JSON.parse(raw) as { token: string; at: number };
    return t === token && Date.now() - at < REREGISTER_AFTER_MS;
  } catch {
    return false;
  }
}

async function rememberRegistered(token: string): Promise<void> {
  try {
    await Storage.setItem(REGISTERED_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    // Non-fatal: we will simply register again next launch.
  }
}

export const usePushStore = create<PushState>((set, get) => ({
  permission: "unknown",
  token: null,
  tokenError: null,
  busy: false,

  refreshPermission: async () => {
    const permission = await getPushPermission();
    set({ permission });
    return permission;
  },

  registerIfAllowed: async () => {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const permission = await getPushPermission();
      set({ permission });
      if (permission !== "granted") return false;
      await ensureAndroidChannel();
      const result = await getExpoPushToken();
      if (!result.token) {
        set({ token: null, tokenError: result.error });
        return false;
      }
      set({ token: result.token, tokenError: null });
      if (!(await alreadyRegistered(result.token))) {
        await registerPushToken(result.token, Platform.OS === "ios" ? "ios" : "android");
        await rememberRegistered(result.token);
      }
      return true;
    } catch (e) {
      set({ tokenError: e instanceof Error ? e.message : "Could not register for push." });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  requestAndRegister: async () => {
    const permission = await requestPushPermission();
    set({ permission });
    if (permission !== "granted") return false;
    return get().registerIfAllowed();
  },
}));

/** Forget the local registration marker (after sign-out or delete-my-data) so the next account re-registers. */
export async function forgetPushRegistration(): Promise<void> {
  try {
    await Storage.removeItem(REGISTERED_KEY);
  } catch {
    // ignore
  }
}
