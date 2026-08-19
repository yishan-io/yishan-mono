import type { AppThemeMode } from "@renderer/ui/theme";

/**
 * User-selected app theme preference: an explicit mode or the system default.
 * Owned by Settings (state + resolution); the Renderer theme factory consumes
 * the resolved {@link AppThemeMode}.
 */
export type AppThemePreference = AppThemeMode | "system";

function isAppThemeMode(value: string): value is AppThemeMode {
  return value === "light" || value === "dark";
}

/** Resolves a user theme preference to a concrete mode. */
export function resolveAppThemeMode(preference: AppThemePreference, systemPrefersDark: boolean): AppThemeMode {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  if (typeof preference === "string" && isAppThemeMode(preference)) {
    return preference;
  }

  return systemPrefersDark ? "dark" : "light";
}
