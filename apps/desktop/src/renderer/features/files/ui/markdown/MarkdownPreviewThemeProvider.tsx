import { ThemeProvider, useTheme } from "@mui/material/styles";
import { displaySettingsStore } from "@renderer/features/settings";
import { createAppTheme } from "@renderer/theme";
import type { ReactNode } from "react";
import { useMemo } from "react";

type MarkdownPreviewThemeProviderProps = {
  children: ReactNode;
};

/** Applies the user-selected markdown preview theme without changing the surrounding app theme. */
export function MarkdownPreviewThemeProvider({ children }: MarkdownPreviewThemeProviderProps) {
  const appTheme = useTheme();
  const markdownThemePreference = displaySettingsStore((state) => state.markdownThemePreference);
  const markdownPreviewThemeMode =
    markdownThemePreference === "inherit" ? appTheme.palette.mode : markdownThemePreference;
  const markdownPreviewTheme = useMemo(() => createAppTheme(markdownPreviewThemeMode), [markdownPreviewThemeMode]);

  return <ThemeProvider theme={markdownPreviewTheme}>{children}</ThemeProvider>;
}
