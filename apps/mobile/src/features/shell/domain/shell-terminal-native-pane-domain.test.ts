import { describe, expect, it } from "vitest";

import {
  buildNativeTerminalOutputSurfaceStyle,
  buildNativeTerminalScrollContentStyle,
  buildNativeTerminalTextStyle,
} from "./shell-terminal-native-pane-domain";

describe("shell-terminal-native-pane-domain", () => {
  it("returns an edge-to-edge surface style without a border", () => {
    const style = buildNativeTerminalOutputSurfaceStyle();

    expect(style.flex).toBe(1);
    expect(style.minHeight).toBe(0);
    expect(style.overflow).toBe("hidden");
    expect(style).not.toHaveProperty("borderWidth");
    expect(style).not.toHaveProperty("borderRadius");
  });

  it("returns a flush scroll content container style", () => {
    expect(buildNativeTerminalScrollContentStyle()).toEqual({
      flexGrow: 1,
    });
  });

  it("returns compact monospace text styles aligned with xterm sizing", () => {
    expect(buildNativeTerminalTextStyle("ios")).toEqual({
      fontFamily: "Menlo",
      fontSize: 12,
      lineHeight: 16,
    });
    expect(buildNativeTerminalTextStyle("android")).toEqual({
      fontFamily: "monospace",
      fontSize: 12,
      lineHeight: 16,
    });
  });
});
