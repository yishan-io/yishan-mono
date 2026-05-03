import {
  DARK_SURFACE_COLORS,
  type DesignTokenThemeMode,
  ELEVATION_TOKENS,
  SEMANTIC_COLOR_TOKENS,
  SHAPE_TOKENS,
  TYPOGRAPHY_TOKENS,
} from "./index";

/**
 * Builds Material UI theme options from shared token semantics.
 */
export function createMuiThemeOptions(mode: DesignTokenThemeMode) {
  const semantics = SEMANTIC_COLOR_TOKENS[mode];
  const isDark = mode === "dark";
  const elevation = isDark ? ELEVATION_TOKENS.dark : ELEVATION_TOKENS.light;
  const listItemButtonSelectedOverrides = {
    "&.Mui-selected": {
      backgroundColor: semantics.action.selected,
    },
    "&.Mui-selected:hover": {
      backgroundColor: semantics.action.hover,
    },
  };
  const dialogPaperOverrides = isDark
    ? {
        backgroundColor: semantics.background.surface,
        backgroundImage: "none",
        border: `1px solid ${semantics.border.default}`,
      }
    : {};
  const floatingSurfaceOverrides = isDark
    ? {
        backgroundColor: semantics.background.surface,
        backgroundImage: "none",
        border: `1px solid ${semantics.border.default}`,
      }
    : {};

  const palette = {
    mode,
    primary: {
      main: semantics.primary,
      contrastText: semantics.text.contrastOnPrimary,
    },
    secondary: {
      main: semantics.secondary,
      contrastText: semantics.text.accent,
    },
    background: {
      default: semantics.background.app,
      paper: semantics.background.surface,
    },
    divider: semantics.border.default,
    text: {
      primary: semantics.text.primary,
      secondary: semantics.text.secondary,
    },
    action: {
      active: semantics.action.active,
      hover: semantics.action.hover,
      selected: semantics.action.selected,
    },
  };

  return {
    palette,
    shape: {
      borderRadius: SHAPE_TOKENS.borderRadiusMd,
    },
    typography: {
      fontSize: TYPOGRAPHY_TOKENS.baseFontSizePx,
      fontFamily: TYPOGRAPHY_TOKENS.fontFamily,
      body2: {
        fontSize: `${TYPOGRAPHY_TOKENS.body2FontSizeRem}rem`,
      },
    },
    components: {
      MuiButtonBase: {
        defaultProps: {
          disableRipple: true,
          disableTouchRipple: true,
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: SHAPE_TOKENS.borderRadiusMd,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: SHAPE_TOKENS.borderRadiusSm,
            "&.MuiButton-contained": {
              boxShadow: elevation.button,
            },
            "&.MuiButton-contained:hover": {
              boxShadow: elevation.buttonHover,
            },
          },
          contained: {
            boxShadow: elevation.button,
            "&:hover": {
              boxShadow: elevation.buttonHover,
            },
          },
        },
      },
      MuiButtonGroup: {
        styleOverrides: {
          root: {
            boxShadow: elevation.button,
          },
          grouped: {
            boxShadow: elevation.button,
          },
        },
      },
      MuiMenuItem: {
        defaultProps: {
          dense: true,
        },
        styleOverrides: {
          root: {
            fontSize: "0.82rem",
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            ...listItemButtonSelectedOverrides,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            ...dialogPaperOverrides,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            ...floatingSurfaceOverrides,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            ...floatingSurfaceOverrides,
          },
        },
      },
    },
  };
}

/**
 * Exposes dark surface aliases for existing desktop consumers while migrating to semantic tokens.
 */
export const MUI_DARK_SURFACE_COLORS = DARK_SURFACE_COLORS;
