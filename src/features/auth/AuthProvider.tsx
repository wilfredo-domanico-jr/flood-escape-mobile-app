import * as SplashScreen from "expo-splash-screen";
import { type PropsWithChildren, useEffect, useRef } from "react";

import { useNetworkSync } from "@/hooks/useNetwork";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

import { describeAuthError, signInAnonymously } from "./api";
import { useAuthStore } from "./authStore";
import { getOnboardingDone } from "./onboarding";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unsupported; nothing to do.
});

let anonymousSignIn: Promise<void> | null = null;

/** Single-flight anonymous sign-in so concurrent triggers never create two accounts. */
export function ensureAnonymousSession(): Promise<void> {
  if (!anonymousSignIn) {
    anonymousSignIn = (async () => {
      const store = useAuthStore.getState();
      try {
        const session = await signInAnonymously();
        store.setSession(session);
        store.setSignInError(null);
      } catch (error) {
        store.setSignInError(describeAuthError(error));
        throw error;
      } finally {
        anonymousSignIn = null;
      }
    })();
  }
  return anonymousSignIn;
}

/**
 * Restores the persisted session, keeps the store in sync with Supabase Auth, and guarantees
 * that a user who finished onboarding always has a session (anonymous by default).
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const online = useNetworkSync();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const onboardingDone = useAuthStore((s) => s.onboardingDone);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bootstrap once: persisted session + onboarding flag, then subscribe to auth changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [done, { data }] = await Promise.all([getOnboardingDone(), supabase.auth.getSession()]);
      if (cancelled) return;
      useAuthStore.getState().setReady(data.session, done);
      await SplashScreen.hideAsync().catch(() => {});
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      useAuthStore.getState().setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Self-heal: no session after onboarding (first launch offline, or after sign-out) → sign in anonymously.
  useEffect(() => {
    if (status !== "ready" || !onboardingDone || session || !online || !isSupabaseConfigured) return;

    let attempt = 0;
    let disposed = false;
    const run = () => {
      ensureAnonymousSession().catch(() => {
        if (disposed) return;
        attempt += 1;
        const delay = Math.min(30_000, 2_000 * 2 ** attempt);
        retryTimer.current = setTimeout(run, delay);
      });
    };
    run();

    return () => {
      disposed = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [status, onboardingDone, session, online]);

  if (status !== "ready") return null;
  return <>{children}</>;
}
