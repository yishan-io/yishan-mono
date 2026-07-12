import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { translate } from "@/features/i18n/copy";
import {
  type AppLanguagePreference,
  loadLanguagePreference,
  saveLanguagePreference,
} from "@/lib/storage/language-preference-storage";

type AppLanguageContextValue = {
  preference: AppLanguagePreference;
  setPreference: (preference: AppLanguagePreference) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

/** Owns language preference restore and mobile translation lookup. */
export function AppLanguageProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<AppLanguagePreference>("en");

  useEffect(() => {
    let cancelled = false;

    void loadLanguagePreference().then((storedPreference) => {
      if (!cancelled) {
        setPreferenceState(storedPreference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: AppLanguagePreference) => {
    setPreferenceState(nextPreference);
    await saveLanguagePreference(nextPreference);
  }, []);

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      preference,
      setPreference,
      t: (key, params) => translate(preference, key, params),
    }),
    [preference, setPreference],
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppLanguage(): AppLanguageContextValue {
  const value = useContext(AppLanguageContext);
  if (!value) {
    throw new Error("useAppLanguage must be used inside AppLanguageProvider");
  }

  return value;
}
