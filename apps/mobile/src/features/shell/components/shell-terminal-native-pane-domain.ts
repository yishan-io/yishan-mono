import type { TextStyle, ViewStyle } from "react-native";

const NATIVE_TERMINAL_FONT_SIZE = 12;
const NATIVE_TERMINAL_LINE_HEIGHT = 16;
const IOS_TERMINAL_FONT_FAMILY = "Menlo";
const ANDROID_TERMINAL_FONT_FAMILY = "monospace";
const FALLBACK_TERMINAL_FONT_FAMILY = "Menlo";

/**
 * Returns the edge-to-edge surface style for the native terminal output pane.
 */
export function buildNativeTerminalOutputSurfaceStyle(): ViewStyle {
  return {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  };
}

/**
 * Returns the scroll content style for the native terminal output pane.
 */
export function buildNativeTerminalScrollContentStyle(): ViewStyle {
  return {
    flexGrow: 1,
  };
}

/**
 * Returns the monospace text style used by the native terminal output pane.
 */
export function buildNativeTerminalTextStyle(platformOs: string): TextStyle {
  return {
    fontFamily: resolveNativeTerminalFontFamily(platformOs),
    fontSize: NATIVE_TERMINAL_FONT_SIZE,
    lineHeight: NATIVE_TERMINAL_LINE_HEIGHT,
  };
}

function resolveNativeTerminalFontFamily(platformOs: string): string {
  if (platformOs === "android") {
    return ANDROID_TERMINAL_FONT_FAMILY;
  }

  if (platformOs === "ios") {
    return IOS_TERMINAL_FONT_FAMILY;
  }

  return FALLBACK_TERMINAL_FONT_FAMILY;
}
