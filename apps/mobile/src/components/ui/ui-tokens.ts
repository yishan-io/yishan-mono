import { COLOR_PRIMITIVES } from "@yishan/design-tokens/v1";

const SHEET_BACKDROP_BASE = "#0f172a";
const TERMINAL_DEFAULT_BACKGROUND = COLOR_PRIMITIVES.neutral.white000;
const TERMINAL_DEFAULT_FOREGROUND = "#111111";
const TERMINAL_SCROLLBAR_THUMB = "rgba(107, 114, 128, 0.55)";
const TERMINAL_STATUS_COLORS = {
  error: "#ef4444",
  running: "#2563eb",
  success: "#10b981",
  warning: "#f59e0b",
} as const;
const TERMINAL_PALETTE = {
  dark: {
    black: "#111827",
    brightBlack: "#9ca3af",
    white: "#e5e7eb",
  },
  light: {
    black: "#1f2937",
    brightBlack: "#6b7280",
    white: "#4b5563",
  },
  blue: TERMINAL_STATUS_COLORS.running,
  brightBlue: "#3b82f6",
  brightCyan: "#06b6d4",
  brightGreen: TERMINAL_STATUS_COLORS.success,
  brightMagenta: "#d946ef",
  brightRed: TERMINAL_STATUS_COLORS.error,
  brightYellow: TERMINAL_STATUS_COLORS.warning,
  cyan: "#0891b2",
  green: "#059669",
  magenta: "#c026d3",
  red: "#dc2626",
  yellow: "#d97706",
} as const;

function withAlpha(hexColor: string, alpha: number) {
  const normalizedHex = hexColor.replace("#", "");
  if (normalizedHex.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Owns mobile-local UI constants that are not shared through Tamagui theme slots yet.
 * Keep additions here explicit so feature code consumes named tokens instead of ad hoc style literals.
 */
export const MOBILE_UI_TOKENS = {
  pane: {
    bodyBottom: 20,
    bodyTop: 12,
    headerX: 16,
    insetX: 16,
    noticeBottom: 8,
    secondaryBarInsetY: 8,
    secondaryBarMinHeight: 40,
  },
  shellChrome: {
    dividerTopGap: 12,
    headerInsetX: 16,
    headerMinHeight: 60,
    headerInsetY: 12,
    panelBottomInset: 20,
    panelTopInset: 12,
  },
  radius: {
    dialog: 20,
    input: 12,
    row: 14,
    surface: 16,
  },
  sheet: {
    actionMenuMinHeight: 164,
    backdrop: withAlpha(SHEET_BACKDROP_BASE, 0.36),
    cardWidth: "88%" as const,
    dialogPadding: 18,
    itemGap: 12,
    rowInsetX: 14,
    rowInsetY: 12,
    sideInset: 12,
  },
  status: {
    dotSize: 8,
    error: TERMINAL_STATUS_COLORS.error,
    running: TERMINAL_STATUS_COLORS.running,
    success: TERMINAL_STATUS_COLORS.success,
    warning: TERMINAL_STATUS_COLORS.warning,
  },
  terminal: {
    defaultBackground: TERMINAL_DEFAULT_BACKGROUND,
    defaultForeground: TERMINAL_DEFAULT_FOREGROUND,
    defaultScrollbarThumb: TERMINAL_SCROLLBAR_THUMB,
    nativeText: {
      fontFamily: {
        android: "monospace",
        fallback: "Menlo",
        ios: "Menlo",
      },
      fontSize: 12,
      lineHeight: 16,
    },
    xterm: {
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.3,
      overviewRulerWidth: 0.1,
      scrollback: 5000,
    },
    palette: {
      dark: {
        black: TERMINAL_PALETTE.dark.black,
        brightBlack: TERMINAL_PALETTE.dark.brightBlack,
        white: TERMINAL_PALETTE.dark.white,
      },
      light: {
        black: TERMINAL_PALETTE.light.black,
        brightBlack: TERMINAL_PALETTE.light.brightBlack,
        white: TERMINAL_PALETTE.light.white,
      },
      blue: TERMINAL_PALETTE.blue,
      brightBlue: TERMINAL_PALETTE.brightBlue,
      brightCyan: TERMINAL_PALETTE.brightCyan,
      brightGreen: TERMINAL_PALETTE.brightGreen,
      brightMagenta: TERMINAL_PALETTE.brightMagenta,
      brightRed: TERMINAL_PALETTE.brightRed,
      brightYellow: TERMINAL_PALETTE.brightYellow,
      cyan: TERMINAL_PALETTE.cyan,
      fallbackForeground: {
        dark: COLOR_PRIMITIVES.neutral.white000,
        light: TERMINAL_DEFAULT_FOREGROUND,
      },
      green: TERMINAL_PALETTE.green,
      magenta: TERMINAL_PALETTE.magenta,
      red: TERMINAL_PALETTE.red,
      scrollbarAlpha: {
        dark: 0.34,
        light: 0.22,
      },
      selectionAlpha: {
        dark: 0.24,
        light: 0.18,
      },
      white: {
        dark: TERMINAL_PALETTE.dark.white,
        light: TERMINAL_PALETTE.light.white,
      },
      yellow: TERMINAL_PALETTE.yellow,
    },
  },
} as const;
