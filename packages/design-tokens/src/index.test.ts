import { describe, expect, it } from "vitest";
import {
  DESIGN_TOKEN_VERSION,
  SEMANTIC_COLOR_TOKENS,
  createMuiThemeOptions,
  createReactNativeThemeTokens,
  getDesignTokenPackageInfo,
} from "./index";

describe("getDesignTokenPackageInfo", () => {
  it("returns design token package identity metadata", () => {
    expect(getDesignTokenPackageInfo()).toEqual({
      name: "@yishan/design-tokens",
      layer: "ui-foundation",
    });
  });
});

describe("token version exports", () => {
  it("exposes a stable v1 token contract", () => {
    expect(DESIGN_TOKEN_VERSION).toBe("v1");
    expect(SEMANTIC_COLOR_TOKENS.light.background.app).toBe("#f7f8fa");
    expect(SEMANTIC_COLOR_TOKENS.dark.background.app).toBe("#2b3038");
    expect(SEMANTIC_COLOR_TOKENS.light.primary).toBe("#9f5f06");
    expect(SEMANTIC_COLOR_TOKENS.dark.primary).toBe("#f7bc59");
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
