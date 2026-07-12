import { getStoredValue, setStoredValue } from "@/lib/storage/key-value-storage";

export type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCE_KEY = "yishan.mobile.theme-preference";

export async function loadThemePreference(): Promise<ThemePreference> {
  const raw = await getStoredValue(THEME_PREFERENCE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }

  return "system";
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await setStoredValue(THEME_PREFERENCE_KEY, preference);
}
