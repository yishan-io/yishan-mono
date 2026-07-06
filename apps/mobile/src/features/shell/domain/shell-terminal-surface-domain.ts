import type { ITheme } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { TerminalItem } from "../state/shell.types";

type TerminalKeyboardLayoutInput = {
  keyboardBottomInset: number;
  usesTerminalEmulator: boolean;
};

export type TerminalRendererKind = "native" | "xterm";

const TERMINAL_DOM_STYLE = { flex: 1, minHeight: 0 };

function getHexChannel(channel: string) {
  return Number.parseInt(channel, 16);
}

function parseColorChannels(color: string): [number, number, number] | null {
  const normalized = color.trim();
  const shortHexMatch = normalized.match(/^#([\da-fA-F]{3})$/);
  if (shortHexMatch) {
    const hex = shortHexMatch[1];
    if (!hex) {
      return null;
    }

    const channels = hex.split("").map((channel) => getHexChannel(`${channel}${channel}`));
    if (channels.length === 3) {
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
    }
    return null;
  }

  const hexMatch = normalized.match(/^#([\da-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (!hex) {
      return null;
    }

    return [getHexChannel(hex.slice(0, 2)), getHexChannel(hex.slice(2, 4)), getHexChannel(hex.slice(4, 6))];
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const rgb = rgbMatch[1];
    if (!rgb) {
      return null;
    }

    const channels = rgb
      .split(",")
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel.trim()));
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
    }
  }

  return null;
}

function withAlpha(color: string, alpha: number, fallback: string) {
  const channels = parseColorChannels(color);
  if (!channels) {
    return fallback;
  }

  const [red, green, blue] = channels;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isDarkColor(color: string) {
  const channels = parseColorChannels(color);
  if (!channels) {
    return false;
  }

  const [red, green, blue] = channels;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.5;
}

function getTerminalScrollbarThumbColor(background: string, foreground: string) {
  const darkBackground = isDarkColor(background);
  const scrollbarAlpha = darkBackground
    ? MOBILE_UI_TOKENS.terminal.palette.scrollbarAlpha.dark
    : MOBILE_UI_TOKENS.terminal.palette.scrollbarAlpha.light;
  const fallbackForeground = darkBackground
    ? MOBILE_UI_TOKENS.terminal.palette.fallbackForeground.dark
    : MOBILE_UI_TOKENS.terminal.palette.fallbackForeground.light;

  return withAlpha(foreground, scrollbarAlpha, withAlpha(fallbackForeground, scrollbarAlpha, fallbackForeground));
}

function getTerminalTheme(background: string, foreground: string): ITheme {
  const darkBackground = isDarkColor(background);
  const terminalPalette = darkBackground
    ? MOBILE_UI_TOKENS.terminal.palette.dark
    : MOBILE_UI_TOKENS.terminal.palette.light;
  const selectionAlpha = darkBackground
    ? MOBILE_UI_TOKENS.terminal.palette.selectionAlpha.dark
    : MOBILE_UI_TOKENS.terminal.palette.selectionAlpha.light;
  const selectionFallbackForeground = darkBackground
    ? MOBILE_UI_TOKENS.terminal.palette.fallbackForeground.dark
    : MOBILE_UI_TOKENS.terminal.palette.fallbackForeground.light;

  return {
    background,
    black: terminalPalette.black,
    blue: MOBILE_UI_TOKENS.terminal.palette.blue,
    brightBlack: terminalPalette.brightBlack,
    brightBlue: MOBILE_UI_TOKENS.terminal.palette.brightBlue,
    brightCyan: MOBILE_UI_TOKENS.terminal.palette.brightCyan,
    brightGreen: MOBILE_UI_TOKENS.terminal.palette.brightGreen,
    brightMagenta: MOBILE_UI_TOKENS.terminal.palette.brightMagenta,
    brightRed: MOBILE_UI_TOKENS.terminal.palette.brightRed,
    brightWhite: foreground,
    brightYellow: MOBILE_UI_TOKENS.terminal.palette.brightYellow,
    cursor: foreground,
    cursorAccent: background,
    cyan: MOBILE_UI_TOKENS.terminal.palette.cyan,
    foreground,
    green: MOBILE_UI_TOKENS.terminal.palette.green,
    magenta: MOBILE_UI_TOKENS.terminal.palette.magenta,
    red: MOBILE_UI_TOKENS.terminal.palette.red,
    selectionBackground: withAlpha(
      foreground,
      selectionAlpha,
      withAlpha(selectionFallbackForeground, selectionAlpha, selectionFallbackForeground),
    ),
    white: terminalPalette.white,
    yellow: MOBILE_UI_TOKENS.terminal.palette.yellow,
  };
}

/**
 * Resolves the renderer that the current platform can actually use for terminal output.
 */
export function resolveTerminalRendererKind(
  platformOs: string,
  terminal?: Pick<TerminalItem, "agentKind"> | null,
): TerminalRendererKind {
  if (platformOs === "web") {
    return "native";
  }

  return "xterm";
}

/**
 * Builds the native terminal stream key for xterm-backed surfaces.
 */
export function buildNativeTerminalStreamKey(selectedTerminal: TerminalItem | null, usesTerminalEmulator: boolean) {
  if (!usesTerminalEmulator || !selectedTerminal) {
    return null;
  }

  return `${selectedTerminal.id}:${selectedTerminal.session?.sessionId ?? "pending"}`;
}

/**
 * Returns DOM props for the native terminal host when the emulator is active.
 */
export function buildTerminalDomProps(usesTerminalEmulator: boolean): DOMProps | undefined {
  if (!usesTerminalEmulator) {
    return undefined;
  }

  return {
    bounces: false,
    hideKeyboardAccessoryView: true,
    keyboardDisplayRequiresUserAction: false,
    overScrollMode: "never",
    style: TERMINAL_DOM_STYLE,
  };
}

/**
 * Computes keyboard-aware layout values for the mobile terminal surface.
 */
export function getTerminalKeyboardLayout({ keyboardBottomInset, usesTerminalEmulator }: TerminalKeyboardLayoutInput) {
  const resolvedKeyboardBottomInset = Math.max(0, keyboardBottomInset);
  const viewportBottomInset = usesTerminalEmulator ? resolvedKeyboardBottomInset : 0;
  const composerBottomInset = usesTerminalEmulator ? 0 : resolvedKeyboardBottomInset;

  return {
    composerBottomInset,
    keyboardVisible: resolvedKeyboardBottomInset > 0,
    viewportBottomInset,
  };
}

/**
 * Computes the terminal palette derived from the current app theme colors.
 */
export function getTerminalPalette(background: string, foreground: string) {
  return {
    scrollbarThumbColor: getTerminalScrollbarThumbColor(background, foreground),
    terminalTheme: getTerminalTheme(background, foreground),
  };
}
