import { describe, expect, it } from "vitest";
import {
  DESIGN_TOKEN_VERSION,
  SEMANTIC_COLOR_TOKENS,
  createMuiThemeOptions,
  createReactNativeThemeTokens,
} from "./index";

describe("token version exports", () => {
  it("exposes a stable v1 token contract", () => {
    expect(DESIGN_TOKEN_VERSION).toBe("v1");
    expect(SEMANTIC_COLOR_TOKENS.light.background.app).toBe("#f7f8fa");
    expect(SEMANTIC_COLOR_TOKENS.dark.background.app).toBe("#2b3038");
    expect(SEMANTIC_COLOR_TOKENS.light.primary).toBe("#9f5f06");
    expect(SEMANTIC_COLOR_TOKENS.dark.primary).toBe("#9ddb72");
    expect(SEMANTIC_COLOR_TOKENS.light.gitDiff).toEqual({
      added: "#2ea043",
      modified: "#1a7fd4",
      deleted: "#f85149",
      inline: {
        added: { foreground: "#116329", background: "#dafbe1" },
        deleted: { foreground: "#82071e", background: "#ffebe9" },
      },
      pierreFallback: { added: "#0dbe4e", deleted: "#ff2e3f" },
    });
    expect(SEMANTIC_COLOR_TOKENS.dark.gitDiff).toEqual({
      added: "#3fb950",
      modified: "#58a6ff",
      deleted: "#f85149",
      inline: {
        added: { foreground: "#7ee787", background: "rgba(63, 185, 80, 0.15)" },
        deleted: { foreground: "#ffa198", background: "rgba(248, 81, 73, 0.15)" },
      },
      pierreFallback: { added: "#0dbe4e", deleted: "#ff2e3f" },
    });
  });
});

describe("platform adapters", () => {
  it("builds a MUI theme option payload", () => {
    const muiOptions = createMuiThemeOptions("dark");

    expect(muiOptions.palette).toMatchObject({
      mode: "dark",
      background: {
        default: "#2b3038",
        paper: "#31363f",
      },
      text: {
        primary: "#e7ebf0",
      },
      action: {
        selected: "rgba(221, 226, 233, 0.08)",
      },
    });
  });

  it("maps light-mode MUI action states to the shared palette", () => {
    const muiOptions = createMuiThemeOptions("light");

    expect(muiOptions.palette).toMatchObject({
      action: {
        hover: "#f3f4f6",
        selected: "#eceff3",
      },
    });
  });

  it("provides shared ButtonBase and Tooltip defaults", () => {
    const muiOptions = createMuiThemeOptions("dark");

    expect(muiOptions.components.MuiButtonBase.defaultProps).toMatchObject({
      disableRipple: true,
      disableTouchRipple: true,
    });
    expect(muiOptions.components.MuiButton.styleOverrides.root).toMatchObject({
      textTransform: "none",
    });
    expect(muiOptions.components.MuiTooltip.defaultProps.arrow).toBe(true);
  });

  it("builds a React Native token payload", () => {
    const nativeTheme = createReactNativeThemeTokens("light");

    expect(nativeTheme).toMatchObject({
      mode: "light",
      colors: {
        backgroundApp: "#f7f8fa",
        textPrimary: "#19211f",
      },
      typography: {
        bodyFontSize: 14,
        captionFontSize: 12.25,
      },
      shape: {
        borderRadiusSm: 4,
        borderRadiusMd: 8,
      },
    });
  });
});
