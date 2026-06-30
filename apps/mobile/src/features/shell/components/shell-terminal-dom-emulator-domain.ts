import type { ITerminalOptions, ITheme } from "@xterm/xterm";

const DEFAULT_TERMINAL_BACKGROUND = "#ffffff";
const DEFAULT_TERMINAL_FOREGROUND = "#111111";
const DEFAULT_SCROLLBAR_THUMB = "rgba(107, 114, 128, 0.55)";
const HIDDEN_OVERVIEW_RULER_WIDTH = 0.1;

/**
 * Builds the xterm terminal options for the mobile shell emulator.
 */
export function buildShellTerminalOptions(theme: ITheme): ITerminalOptions {
  return {
    allowTransparency: true,
    convertEol: false,
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.3,
    overviewRuler: {
      // xterm falls back with `width || 14`, so a tiny positive number avoids
      // the 14px gutter while still rounding to a hidden scrollbar internally.
      width: HIDDEN_OVERVIEW_RULER_WIDTH,
    },
    scrollback: 5000,
    theme,
  };
}

/**
 * Returns the inline style used by the root DOM wrapper around xterm.
 */
export function buildShellTerminalRootStyle(terminalTheme: ITheme, scrollbarThumbColor?: string): React.CSSProperties {
  return {
    background: terminalTheme.background ?? DEFAULT_TERMINAL_BACKGROUND,
    color: terminalTheme.foreground ?? DEFAULT_TERMINAL_FOREGROUND,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
    ["--terminal-bg" as string]: terminalTheme.background ?? DEFAULT_TERMINAL_BACKGROUND,
    ["--terminal-fg" as string]: terminalTheme.foreground ?? DEFAULT_TERMINAL_FOREGROUND,
    ["--terminal-scrollbar-thumb" as string]: scrollbarThumbColor ?? DEFAULT_SCROLLBAR_THUMB,
  };
}

/**
 * Returns the CSS injected into the root emulator wrapper to style xterm.
 */
export function getShellTerminalViewportCss() {
  return `
    html,
    body {
      background: var(--terminal-bg);
      height: 100%;
      margin: 0;
      overflow: hidden;
      overscroll-behavior: none;
      width: 100%;
    }

    #root {
      display: flex;
      flex: 1;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      width: 100%;
    }

    .xterm {
      display: flex;
      flex: 1;
      height: 100%;
      background: var(--terminal-bg);
      color: var(--terminal-fg);
      min-height: 0;
      min-width: 0;
      width: 100%;
    }

    .xterm-viewport {
      background-color: var(--terminal-bg) !important;
      -webkit-overflow-scrolling: touch;
      max-height: 100%;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior-x: none;
      overscroll-behavior-y: contain;
      -ms-overflow-style: none;
      scrollbar-width: none;
      touch-action: pan-y;
      width: 100%;
    }

    .xterm-viewport::-webkit-scrollbar {
      display: none;
      height: 0;
      width: 0;
    }
  `;
}
