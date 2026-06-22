import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { TamaguiProvider, Theme } from "tamagui";

import { type ThemePreference, loadThemePreference, saveThemePreference } from "@/lib/storage/theme-preference-storage";
import { tamaguiConfig } from "@/lib/theme";

type ResolvedTheme = "light" | "dark";

type AppThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/** Owns theme preference restore and Tamagui theme injection for mobile. */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    void loadThemePreference().then((storedPreference) => {
      if (!cancelled) {
        setPreferenceState(storedPreference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemColorScheme === "dark" ? "dark" : "light") : preference;

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await saveThemePreference(nextPreference);
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return (
    <AppThemeContext.Provider value={value}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
        <Theme key={resolvedTheme} name={resolvedTheme}>
          {children}
        </Theme>
      </TamaguiProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }

  return value;
}
