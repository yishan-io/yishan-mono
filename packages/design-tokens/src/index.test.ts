import { describe, expect, it } from "vitest";
import {
  DESIGN_TOKEN_VERSION,
  SEMANTIC_COLOR_TOKENS,
  TYPOGRAPHY_TOKENS,
  createMuiThemeOptions,
  createReactNativeThemeTokens,
} from "./index";

describe("token version exports", () => {
  it("locks the editor typography tokens", () => {
    expect(TYPOGRAPHY_TOKENS.monoFontFamily).toBe('"JetBrains Mono", "SF Mono", Menlo, monospace');
    expect(TYPOGRAPHY_TOKENS.editorFontSizePx).toBe(13);
    expect(TYPOGRAPHY_TOKENS.editorFontSizeMinPx).toBe(11);
    expect(TYPOGRAPHY_TOKENS.editorFontSizeMaxPx).toBe(18);
  });

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
    expect(SEMANTIC_COLOR_TOKENS.light.editor).toEqual({
      foreground: "#1f2430",
      lineHighlight: "#f1f3f7",
      selection: "#ced7ec",
      lineNumber: "#7a8190",
      gutter: "#f5f6f8",
      cursor: "#2a2a31",
    });
    expect(SEMANTIC_COLOR_TOKENS.dark.editor).toEqual({
      foreground: "#d4dbe8",
      lineHighlight: "#363c46",
      selection: "#dde2e91f",
      lineNumber: "#8e97ab",
      gutter: "#2e333c",
      cursor: "#d7deef",
    });
    expect(SEMANTIC_COLOR_TOKENS.light.syntax).toEqual({
      comment: "#7a8190",
      keyword: "#8a3ffc",
      string: "#2d7a00",
      number: "#bd5500",
      constant: "#9a6100",
      function: "#0060b8",
      type: "#006b99",
      tag: "#b04900",
      attribute: "#0b6ea8",
      operator: "#3f4758",
      delimiter: "#3f4758",
      variable: "#1f2430",
    });
    expect(SEMANTIC_COLOR_TOKENS.dark.syntax).toEqual({
      comment: "#7f8796",
      keyword: "#c49fff",
      string: "#a7d56d",
      number: "#ffa86f",
      constant: "#ffd57a",
      function: "#79c4ff",
      type: "#8ad9ff",
      tag: "#ffb86b",
      attribute: "#86d0ff",
      operator: "#c0c8d8",
      delimiter: "#c0c8d8",
      variable: "#d4dbe8",
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
