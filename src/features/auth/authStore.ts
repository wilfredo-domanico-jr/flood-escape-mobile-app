import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

export type AuthStatus = "loading" | "ready";

type AuthState = {
  /** `loading` until the persisted session and onboarding flag have been read. */
  status: AuthStatus;
  session: Session | null;
  onboardingDone: boolean;
  /** Last error from the automatic anonymous sign-in, for the UI to surface. */
  signInError: string | null;
  setReady: (session: Session | null, onboardingDone: boolean) => void;
  setSession: (session: Session | null) => void;
  setOnboardingDone: (done: boolean) => void;
  setSignInError: (message: string | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  onboardingDone: false,
  signInError: null,
  setReady: (session, onboardingDone) => set({ status: "ready", session, onboardingDone }),
  setSession: (session) => set({ session }),
  setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
  setSignInError: (signInError) => set({ signInError }),
}));

export const selectUser = (s: AuthState): User | null => s.session?.user ?? null;
export const selectIsAnonymous = (s: AuthState): boolean => s.session?.user?.is_anonymous ?? true;
