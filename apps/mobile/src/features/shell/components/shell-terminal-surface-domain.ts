import type { ITheme } from "@xterm/xterm";
import type { DOMProps } from "expo/dom";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { TerminalRendererPreference } from "@/lib/storage/terminal-renderer-preference-storage";
import type { TerminalItem } from "../state/shell.types";

type TerminalKeyboardLayoutInput = {
  keyboardBottomInset: number;
  usesTerminalEmulator: boolean;
};

export type TerminalRendererKind = "native" | "xterm";

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
  return withAlpha(
    foreground,
    darkBackground ? 0.34 : 0.22,
    darkBackground ? "rgba(255, 255, 255, 0.34)" : "rgba(17, 17, 17, 0.22)",
  );
}

function getTerminalTheme(background: string, foreground: string): ITheme {
  const darkBackground = isDarkColor(background);

  return {
    background,
    black: darkBackground ? "#111827" : "#1f2937",
    blue: MOBILE_UI_TOKENS.status.running,
    brightBlack: darkBackground ? "#9ca3af" : "#6b7280",
    brightBlue: "#3b82f6",
    brightCyan: "#06b6d4",
    brightGreen: MOBILE_UI_TOKENS.status.success,
    brightMagenta: "#d946ef",
    brightRed: MOBILE_UI_TOKENS.status.error,
    brightWhite: foreground,
    brightYellow: MOBILE_UI_TOKENS.status.warning,
    cursor: foreground,
    cursorAccent: background,
    cyan: "#0891b2",
    foreground,
    green: "#059669",
    magenta: "#c026d3",
    red: "#dc2626",
    selectionBackground: withAlpha(
      foreground,
      darkBackground ? 0.24 : 0.18,
      darkBackground ? "rgba(255, 255, 255, 0.24)" : "rgba(17, 17, 17, 0.18)",
    ),
    white: darkBackground ? "#e5e7eb" : "#4b5563",
    yellow: "#d97706",
  };
}

/**
 * Resolves the renderer that the current platform can actually use for terminal output.
 */
export function resolveTerminalRendererKind(
  preference: TerminalRendererPreference,
  platformOs: string,
): TerminalRendererKind {
  if (platformOs === "web") {
    return "native";
  }

  return preference;
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
    automaticallyAdjustContentInsets: false,
    bounces: false,
    contentInsetAdjustmentBehavior: "never",
    directionalLockEnabled: true,
    hideKeyboardAccessoryView: true,
    keyboardDisplayRequiresUserAction: false,
    matchContents: false,
    overScrollMode: "never",
    scrollEnabled: true,
    style: { flex: 1, minHeight: 0 },
  };
}

/**
 * Computes keyboard-aware layout values for the mobile terminal surface.
 */
export function getTerminalKeyboardLayout({ keyboardBottomInset, usesTerminalEmulator }: TerminalKeyboardLayoutInput) {
  const viewportBottomInset = usesTerminalEmulator ? Math.max(0, keyboardBottomInset) : 0;

  return {
    keyboardVisible: viewportBottomInset > 0,
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
