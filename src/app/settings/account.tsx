import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
  describeAuthError,
  getPasswordSet,
  markPasswordSet,
  refreshUser,
  setPassword,
  signInWithPassword,
  signOut,
  startEmailLink,
} from "@/features/auth/api";
import { selectUser, useAuthStore } from "@/features/auth/authStore";
import { deriveLinkStep, type LinkStep, pendingEmail } from "@/features/auth/linkStep";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function AccountScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const [passwordSet, setPasswordSetState] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"link" | "signin">("link");
  /** Lets the user re-enter an email while a confirmation is pending. */
  const [changeEmail, setChangeEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getPasswordSet(user.id).then(setPasswordSetState);
  }, [user]);

  const derived: LinkStep = deriveLinkStep(user, passwordSet ?? false);
  const step: LinkStep = changeEmail && derived === "confirm" ? "email" : derived;

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const submitEmail = () =>
    run(async () => {
      if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email address.");
      await startEmailLink(email);
      await refreshUser();
      setChangeEmail(false);
      setNotice("If confirmation is required, check your inbox for a link from Flood Escape.");
    });

  const checkConfirmed = () =>
    run(async () => {
      const refreshed = await refreshUser();
      if (refreshed?.is_anonymous) {
        setNotice("Not confirmed yet. Open the link in the email, then tap this again.");
      }
    });

  const submitPassword = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
      if (password !== password2) throw new Error("Passwords don't match.");
      await setPassword(password);
      if (user) await markPasswordSet(user.id);
      setPasswordSetState(true);
      setPassword1("");
      setPassword2("");
      setNotice("Your account is now permanent. Sign in with this email on any device.");
    });

  const submitSignIn = () => {
    const proceed = () =>
      run(async () => {
        if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email address.");
        const session = await signInWithPassword(email, password);
        await markPasswordSet(session.user.id);
        setPasswordSetState(true);
        queryClient.clear();
        router.back();
      });
    if (user?.is_anonymous) {
      Alert.alert(
        "Switch accounts?",
        "Reports made with this anonymous account will no longer show in your history.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign in", style: "destructive", onPress: proceed },
        ],
      );
    } else {
      proceed();
    }
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You'll get a fresh anonymous account on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () =>
          run(async () => {
            await signOut();
            queryClient.clear();
            router.back();
          }),
      },
    ]);
  };

  const feedback = (
    <>
      {error ? (
        <Text className="text-sm text-severity-impassable" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text className="text-sm text-ink-secondary" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
    </>
  );

  let content: ReactNode;

  if (mode === "signin") {
    content = (
      <View className="gap-4">
        <Text className="text-xl font-bold text-ink">Sign in</Text>
        <Text className="text-base text-ink-secondary">Use the email and password you set earlier.</Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword1}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        {feedback}
        <Button title="Sign in" onPress={submitSignIn} loading={busy} />
        <Button title="Back" variant="ghost" onPress={() => setMode("link")} disabled={busy} />
      </View>
    );
  } else if (step === "email") {
    content = (
      <View className="gap-4">
        <Text className="text-xl font-bold text-ink">Keep your history</Text>
        <Text className="text-base leading-6 text-ink-secondary">
          You&apos;re using an anonymous account. Add an email to keep your reports and verifications if you
          change phones. Your email is never shown to other users.
        </Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {feedback}
        <Button title="Add email" onPress={submitEmail} loading={busy} />
        <Button
          title="Already have an account? Sign in"
          variant="ghost"
          onPress={() => setMode("signin")}
          disabled={busy}
        />
      </View>
    );
  } else if (step === "confirm") {
    content = (
      <View className="gap-4">
        <Text className="text-xl font-bold text-ink">Confirm your email</Text>
        <Text className="text-base leading-6 text-ink-secondary">
          We sent a link to <Text className="font-semibold text-ink">{pendingEmail(user)}</Text>. Open it,
          then come back here.
        </Text>
        {feedback}
        <Button title="I've confirmed" onPress={checkConfirmed} loading={busy} />
        <Button
          title="Use a different email"
          variant="ghost"
          onPress={() => setChangeEmail(true)}
          disabled={busy}
        />
      </View>
    );
  } else if (step === "password") {
    content = (
      <View className="gap-4">
        <Text className="text-xl font-bold text-ink">Set a password</Text>
        <Text className="text-base leading-6 text-ink-secondary">
          Your email is confirmed. Choose a password so you can sign in on another device.
        </Text>
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword1}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`At least ${MIN_PASSWORD} characters`}
        />
        <TextField
          label="Repeat password"
          value={password2}
          onChangeText={setPassword2}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {feedback}
        <Button title="Set password" onPress={submitPassword} loading={busy} />
      </View>
    );
  } else {
    content = (
      <View className="gap-4">
        <Text className="text-xl font-bold text-ink">Your account</Text>
        <View className="rounded-card bg-surface-raised p-4">
          <Text className="text-sm text-ink-muted">Signed in as</Text>
          <Text className="text-base font-semibold text-ink">{user?.email}</Text>
        </View>
        {feedback}
        <Button title="Sign out" variant="secondary" onPress={confirmSignOut} loading={busy} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerClassName="px-5 py-6"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
