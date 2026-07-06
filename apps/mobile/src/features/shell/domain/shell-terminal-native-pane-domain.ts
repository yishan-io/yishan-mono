import type { TextStyle, ViewStyle } from "react-native";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";

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
    fontSize: MOBILE_UI_TOKENS.terminal.nativeText.fontSize,
    lineHeight: MOBILE_UI_TOKENS.terminal.nativeText.lineHeight,
  };
}

function resolveNativeTerminalFontFamily(platformOs: string): string {
  if (platformOs === "android") {
    return MOBILE_UI_TOKENS.terminal.nativeText.fontFamily.android;
  }

  if (platformOs === "ios") {
    return MOBILE_UI_TOKENS.terminal.nativeText.fontFamily.ios;
  }

  return MOBILE_UI_TOKENS.terminal.nativeText.fontFamily.fallback;
}
