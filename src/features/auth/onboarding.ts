import Storage from "expo-sqlite/kv-store";

const KEY = "onboarding.completed.v1";

export async function getOnboardingDone(): Promise<boolean> {
  try {
    return (await Storage.getItem(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setOnboardingDone(): Promise<void> {
  try {
    await Storage.setItem(KEY, "1");
  } catch {
    // Non-fatal: the user will simply see onboarding again next launch.
  }
}
