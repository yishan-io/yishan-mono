import { useMediaQuery } from "@mui/material";
import type { AppThemeMode } from "@renderer/ui/theme";
import { TYPOGRAPHY_TOKENS } from "@yishan-io/design-tokens";
import { createCssThemeVariables } from "@yishan-io/design-tokens/v1/css";
import { type ReactNode, createContext, useContext, useLayoutEffect, useMemo } from "react";
import { displaySettingsStore } from "../state/displaySettingsStore";
import { editorSettingsStore } from "../state/editorSettingsStore";
import type { AppThemePreference } from "../state/themePreference";
import { resolveAppThemeMode } from "../state/themePreference";

type AppThemePreferenceContextValue = {
  themePreference: AppThemePreference;
  themeMode: AppThemeMode;
  setThemePreference: (preference: AppThemePreference) => void;
};

const AppThemePreferenceContext = createContext<AppThemePreferenceContextValue | null>(null);

/** Provides persisted app theme preference and resolved theme mode for desktop main view routes. */
export function AppThemePreferenceProvider({ children }: { children: ReactNode }) {
  const themePreference = displaySettingsStore((state) => state.themePreference);
  const setThemePreference = displaySettingsStore((state) => state.setThemePreference);
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const themeMode = resolveAppThemeMode(themePreference, systemPrefersDark);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const rootElement = document.documentElement;
    const cssThemeVariables = createCssThemeVariables(themeMode);

    rootElement.style.colorScheme = themeMode;
    rootElement.setAttribute("data-app-theme-mode", themeMode);
    for (const [property, value] of Object.entries(cssThemeVariables)) {
      rootElement.style.setProperty(property, value);
    }

    rootElement.style.setProperty("--yishan-font-mono", TYPOGRAPHY_TOKENS.monoFontFamily);
  }, [themeMode]);

  const editorFontSize = editorSettingsStore((s) => s.editorFontSize);
  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.style.setProperty("--yishan-color-editor-font-size-px", `${editorFontSize}px`);
  }, [editorFontSize]);

  const value = useMemo<AppThemePreferenceContextValue>(
    () => ({
      themePreference,
      themeMode,
      setThemePreference,
    }),
    [setThemePreference, themeMode, themePreference],
  );

  return <AppThemePreferenceContext.Provider value={value}>{children}</AppThemePreferenceContext.Provider>;
}

/** Returns shared theme preference state/actions for AppShell and SettingsView. */
export function useThemePreference() {
  const context = useOptionalThemePreference();
  if (!context) {
    throw new Error("useThemePreference must be used within AppThemePreferenceProvider.");
  }

  return context;
}

/** Returns shared theme preference state/actions when the provider is available. */
export function useOptionalThemePreference() {
  return useContext(AppThemePreferenceContext);
}
