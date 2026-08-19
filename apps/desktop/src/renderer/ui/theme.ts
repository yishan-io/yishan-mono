import { createTheme } from "@mui/material/styles";
import { DARK_SURFACE_COLORS as _DARK_SURFACE_COLORS } from "@yishan-io/design-tokens/v1";
import type { DesignTokenThemeMode } from "@yishan-io/design-tokens/v1";
import { createMuiThemeOptions } from "@yishan-io/design-tokens/v1/mui";

export type AppThemeMode = DesignTokenThemeMode;

export const DARK_SURFACE_COLORS = _DARK_SURFACE_COLORS;

/**
 * Creates the renderer theme, including compact defaults for MUI `IconButton`
 * and `TextField` controls. Runtime controls inherit these defaults unless
 * their component contract explicitly overrides the size.
 *
 * Business-neutral root UI: Theme creation belongs to the Renderer; user
 * preference and mode resolution live in the Settings Domain.
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
