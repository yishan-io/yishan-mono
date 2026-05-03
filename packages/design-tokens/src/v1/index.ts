/**
 * Stable token contract version exported by this package.
 */
export const DESIGN_TOKEN_VERSION = "v1" as const;

/**
 * Supported visual modes for semantic token selection.
 */
export type DesignTokenThemeMode = "light" | "dark";

/**
 * Shared typography token values reused by platform adapters.
 */
export const TYPOGRAPHY_TOKENS = {
  baseFontSizePx: 14,
  body2FontSizeRem: 0.875,
  fontFamily: '"Manrope", "SF Pro Text", "Segoe UI", sans-serif',
} as const;

/**
 * Shared shape token values reused by platform adapters.
 */
export const SHAPE_TOKENS = {
  borderRadiusSm: 4,
  borderRadiusMd: 8,
} as const;

/**
 * Shared elevation token values reused by platform adapters.
 */
export const ELEVATION_TOKENS = {
  light: {
    button: "0 1px 2px rgba(19, 35, 34, 0.12)",
    buttonHover: "0 1px 3px rgba(19, 35, 34, 0.18)",
  },
  dark: {
    button: "0 1px 2px rgba(0, 0, 0, 0.24)",
    buttonHover: "0 1px 3px rgba(0, 0, 0, 0.3)",
  },
} as const;

/**
 * Framework-agnostic primitive color values.
 */
export const COLOR_PRIMITIVES = {
  brand: {
    amber700: "#b66c08",
    amber600: "#9f5f06",
    amber500: "#f0a229",
    amber300: "#f7bc59",
    amber200: "#ffd99a",
    // Backward-compatible v1 aliases preserved for existing consumers.
    sand500: "#f0a229",
    sand300: "#f7bc59",
  },
  neutral: {
    pine950: "#0f1d1c",
    pine900: "#132322",
    pine850: "#17302d",
    pine800: "#1d3a36",
    pine700: "#224641",
    pine650: "#27514a",
    pine600: "#35655e",
    pine500: "#4f7d73",
    sage500: "#6f8d84",
    sage400: "#8ca6a0",
    sage300: "#afc1bb",
    sage200: "#c8d8d2",
    sage150: "#dbe7e1",
    sage100: "#edf3ef",
    sage050: "#f6f8f3",
    mist300: "#d5dfda",
    mist200: "#c4d0ca",
    mist100: "#e7eeea",
    white000: "#ffffff",
    ink900: "#19211f",
    ink700: "#41504b",
    ink600: "#566761",
    ink300: "#7b8c87",
    // Backward-compatible v1 aliases preserved for existing consumers.
    slate950: "#0f1d1c",
    slate900: "#132322",
    slate850: "#151d1b",
    slate800: "#1a2321",
    slate700: "#22302d",
    slate650: "#293936",
    slate600: "#35504b",
    slate500: "#4f7d73",
    slate400: "#8ca6a0",
    slate300: "#afc1bb",
    slate200: "#c8d8d2",
    slate100: "#edf3ef",
    silver300: "#d5dfda",
    silver200: "#c4d0ca",
    white200: "#f6f8f3",
    white150: "#edf3ef",
    white100: "#e7eeea",
    white050: "#dbe7e1",
    ink200: "#d5dfda",
  },
} as const;

/**
 * Framework-agnostic semantic color values for each mode.
 */
export const SEMANTIC_COLOR_TOKENS = {
  light: {
    text: {
      primary: COLOR_PRIMITIVES.neutral.ink900,
      secondary: COLOR_PRIMITIVES.neutral.ink600,
      contrastOnPrimary: COLOR_PRIMITIVES.neutral.sage050,
      accent: COLOR_PRIMITIVES.neutral.ink700,
    },
    background: {
      app: "#f7f8fa",
      surface: COLOR_PRIMITIVES.neutral.white000,
      editor: COLOR_PRIMITIVES.neutral.white000,
      gutter: "#f5f6f8",
      activeLine: "#f3f4f6",
    },
    border: {
      default: "#d8dde4",
      editor: "#dfe3e8",
    },
    action: {
      active: COLOR_PRIMITIVES.neutral.ink600,
      hover: "#f3f4f6",
      selected: "#eceff3",
    },
    primary: COLOR_PRIMITIVES.brand.amber600,
    secondary: "#eceff3",
  },
  dark: {
    text: {
      primary: COLOR_PRIMITIVES.neutral.mist100,
      secondary: COLOR_PRIMITIVES.neutral.sage300,
      contrastOnPrimary: COLOR_PRIMITIVES.neutral.pine950,
      accent: COLOR_PRIMITIVES.neutral.sage100,
    },
    background: {
      app: "#212425",
      surface: "#282c2d",
      editor: "#1d2021",
      gutter: "#25292a",
      activeLine: "#2b3131",
    },
    border: {
      default: "#353a3b",
      editor: "#404647",
    },
    action: {
      active: COLOR_PRIMITIVES.neutral.sage400,
      hover: "rgba(127, 209, 168, 0.2)",
      selected: "rgba(127, 209, 168, 0.16)",
    },
    primary: COLOR_PRIMITIVES.brand.amber300,
    secondary: "#3f5750",
  },
} as const;

/**
 * Shared editor surface colors used by both desktop and mobile presentation layers.
 */
export const EDITOR_SURFACE_COLORS = {
  light: {
    mainPane: SEMANTIC_COLOR_TOKENS.light.background.editor,
    gutter: SEMANTIC_COLOR_TOKENS.light.background.gutter,
    activeLine: SEMANTIC_COLOR_TOKENS.light.background.activeLine,
    border: SEMANTIC_COLOR_TOKENS.light.border.editor,
  },
  dark: {
    mainPane: SEMANTIC_COLOR_TOKENS.dark.background.editor,
    elevated: SEMANTIC_COLOR_TOKENS.dark.background.surface,
    gutter: SEMANTIC_COLOR_TOKENS.dark.background.gutter,
    activeLine: SEMANTIC_COLOR_TOKENS.dark.background.activeLine,
    border: SEMANTIC_COLOR_TOKENS.dark.border.default,
  },
} as const;

/**
 * Backward-compatible dark surface aliases currently used by desktop renderer views.
 */
export const DARK_SURFACE_COLORS = EDITOR_SURFACE_COLORS.dark;

/**
 * Returns one semantic color token group for a selected mode.
 */
export function getSemanticColorTokens(mode: DesignTokenThemeMode) {
  return SEMANTIC_COLOR_TOKENS[mode];
}
