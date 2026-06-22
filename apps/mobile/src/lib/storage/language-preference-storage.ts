import { getStoredValue, setStoredValue } from "@/lib/storage/key-value-storage";

export type AppLanguagePreference = "en" | "zh";

const LANGUAGE_PREFERENCE_KEY = "yishan.mobile.languagePreference";
const SUPPORTED_LANGUAGES: readonly AppLanguagePreference[] = ["en", "zh"];
const DEFAULT_LANGUAGE: AppLanguagePreference = "en";

function isAppLanguagePreference(value: string | null): value is AppLanguagePreference {
  return (SUPPORTED_LANGUAGES as readonly (string | null)[]).includes(value);
}

export async function loadLanguagePreference(): Promise<AppLanguagePreference> {
  const storedValue = await getStoredValue(LANGUAGE_PREFERENCE_KEY);
  return isAppLanguagePreference(storedValue) ? storedValue : DEFAULT_LANGUAGE;
}

export async function saveLanguagePreference(preference: AppLanguagePreference): Promise<void> {
  await setStoredValue(LANGUAGE_PREFERENCE_KEY, preference);
}
