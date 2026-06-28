import { describe, expect, it } from "vitest";

import {
  buildShellTerminalOptions,
  buildShellTerminalRootStyle,
  getShellTerminalViewportCss,
} from "./shell-terminal-dom-emulator-domain";

describe("shell-terminal-dom-emulator-domain", () => {
  it("builds xterm options with the expected shell defaults", () => {
    const options = buildShellTerminalOptions({
      background: "#101214",
      foreground: "#f5f5f5",
    });

    expect(options.cursorStyle).toBe("bar");
    expect(options.fontSize).toBe(12);
    expect(options.overviewRuler?.width).toBe(0.1);
    expect(options.scrollback).toBe(5000);
    expect(options.theme?.background).toBe("#101214");
  });

  it("builds root style variables from theme and scrollbar colors", () => {
    const style = buildShellTerminalRootStyle(
      {
        background: "#101214",
        foreground: "#f5f5f5",
      },
      "rgba(255,255,255,0.4)",
    );

    expect(style.background).toBe("#101214");
    expect(style.color).toBe("#f5f5f5");
    expect(style["--terminal-bg" as keyof typeof style]).toBe("#101214");
    expect(style["--terminal-scrollbar-thumb" as keyof typeof style]).toBe("rgba(255,255,255,0.4)");
  });

  it("returns the xterm viewport css block", () => {
    const css = getShellTerminalViewportCss();

    expect(css).toContain(".xterm");
    expect(css).toContain(".xterm-viewport");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("-webkit-overflow-scrolling: touch");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain("display: none");
    expect(css).toContain("touch-action: pan-y");
    expect(css).not.toContain("touch-action: none");
  });
});
