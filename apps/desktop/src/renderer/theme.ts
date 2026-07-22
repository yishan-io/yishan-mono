import { createTheme } from "@mui/material/styles";
import { DARK_SURFACE_COLORS as _DARK_SURFACE_COLORS } from "@yishan-io/design-tokens/v1";
import type { DesignTokenThemeMode } from "@yishan-io/design-tokens/v1";
import { createMuiThemeOptions } from "@yishan-io/design-tokens/v1/mui";

export type AppThemeMode = DesignTokenThemeMode;
export type AppThemePreference = AppThemeMode | "system";

export const DARK_SURFACE_COLORS = _DARK_SURFACE_COLORS;

function isAppThemeMode(value: string): value is AppThemeMode {
  return value === "light" || value === "dark";
}

export function resolveAppThemeMode(preference: AppThemePreference, systemPrefersDark: boolean): AppThemeMode {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  if (typeof preference === "string" && isAppThemeMode(preference)) {
    return preference;
  }

  return systemPrefersDark ? "dark" : "light";
}

/**
 * Creates the renderer theme, including compact defaults for MUI `IconButton` and `TextField` controls.
 * Runtime controls inherit these defaults unless their component contract explicitly overrides the size.
 */
export function createAppTheme(mode: AppThemeMode) {
  const tokenThemeOptions = createMuiThemeOptions(mode);

  return createTheme({
    ...tokenThemeOptions,
    components: {
      ...tokenThemeOptions.components,
      MuiIconButton: {
        ...tokenThemeOptions.components.MuiIconButton,
        defaultProps: {
          size: "small",
        },
      },
      MuiTextField: {
        defaultProps: {
          size: "small",
        },
      },
    },
  });
}
