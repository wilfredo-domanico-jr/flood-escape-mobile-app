/**
 * Pure derivation of where a user is in the "make my account permanent" flow.
 * Kept free of Supabase imports so it is trivially unit-testable.
 */
export type LinkStep = "email" | "confirm" | "password" | "done";

export type LinkUser = {
  email?: string | null;
  /** Supabase sets `new_email` while an email change is awaiting confirmation. */
  new_email?: string | null;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
};

export function pendingEmail(user: LinkUser | null): string | null {
  if (!user) return null;
  return user.new_email || user.email || null;
}

export function deriveLinkStep(user: LinkUser | null, passwordSet: boolean): LinkStep {
  if (!user) return "email";
  const anonymous = user.is_anonymous ?? true;
  const email = pendingEmail(user);

  if (anonymous) {
    // Email attached but the confirmation link has not been clicked yet.
    return email ? "confirm" : "email";
  }
  if (!user.email_confirmed_at && user.new_email) {
    return "confirm";
  }
  return passwordSet ? "done" : "password";
}
