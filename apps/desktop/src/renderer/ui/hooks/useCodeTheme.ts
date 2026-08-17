import { getMonacoThemeName, resolveCodeTheme } from "../../helpers/codeThemes";
import { editorSettingsStore } from "../../features/settings/state/editorSettingsStore";
import { useThemePreference } from "./useThemePreference";

/**
 * Returns the resolved code theme palette, Monaco theme name, and mode
 * based on the user's code theme family preference and the current app
 * theme mode (from the shared AppThemePreferenceProvider).
 */
export function useCodeTheme() {
  const { themeMode } = useThemePreference();
  const codeThemePreference = editorSettingsStore((s) => s.codeThemePreference);

  return {
    palette: resolveCodeTheme(codeThemePreference, themeMode),
    themeName: getMonacoThemeName(codeThemePreference, themeMode),
    mode: themeMode,
  };
}
