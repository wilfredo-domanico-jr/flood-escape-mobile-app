import type { AuthError, Session, User } from "@supabase/supabase-js";
import Storage from "expo-sqlite/kv-store";

import { supabase } from "@/lib/supabase/client";

/** Creates a throwaway account so reporting works without any sign-up friction. */
export async function signInAnonymously(): Promise<Session> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error("No session returned from anonymous sign-in");
  return data.session;
}

/**
 * Step 1 of converting an anonymous account: attach an email. Supabase sends a confirmation
 * link when confirmations are enabled; the account becomes permanent once it is clicked.
 */
export async function startEmailLink(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

/** Re-reads the user from the server (fresh `is_anonymous` / `email_confirmed_at`) and refreshes the JWT. */
export async function refreshUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.user;
}

/** Step 2: set a password. Requires a verified email. */
export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

const PASSWORD_FLAG_PREFIX = "account.passwordSet.";

export async function getPasswordSet(userId: string): Promise<boolean> {
  try {
    return (await Storage.getItem(PASSWORD_FLAG_PREFIX + userId)) === "1";
  } catch {
    return false;
  }
}

export async function markPasswordSet(userId: string): Promise<void> {
  try {
    await Storage.setItem(PASSWORD_FLAG_PREFIX + userId, "1");
  } catch {
    // Non-fatal; the user may be asked to set a password again.
  }
}

/** Turns Supabase auth errors into short, honest sentences for the UI. */
export function describeAuthError(error: unknown): string {
  const message = (error as AuthError | Error | undefined)?.message ?? "";
  const lower = message.toLowerCase();
  if (lower.includes("already") && lower.includes("email")) {
    return "That email already has an account. Sign in to it instead.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("password") && lower.includes("at least")) {
    return message;
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "No connection. Check your internet and try again.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message || "Something went wrong. Please try again.";
}
