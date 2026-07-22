import { createCssThemeVariables as createLatestCssThemeVariables } from "@yishan-io/design-tokens/css";
import { type CssThemeVariables, createCssThemeVariables } from "@yishan-io/design-tokens/v1/css";
import { describe, expect, it } from "vitest";

describe("createCssThemeVariables", () => {
  it("returns the exact light-mode semantic variable map", () => {
    const variables: CssThemeVariables = createCssThemeVariables("light");

    expect(variables).toEqual({
      "--yishan-color-background-app": "#f7f8fa",
      "--yishan-color-action-selected": "#eceff3",
      "--yishan-color-action-hover": "#f3f4f6",
    });
    expect(Object.keys(variables)).toEqual([
      "--yishan-color-background-app",
      "--yishan-color-action-selected",
      "--yishan-color-action-hover",
    ]);
  });

  it("returns the exact dark-mode semantic variable map", () => {
    const variables = createCssThemeVariables("dark");

    expect(variables).toEqual({
      "--yishan-color-background-app": "#2b3038",
      "--yishan-color-action-selected": "rgba(221, 226, 233, 0.08)",
      "--yishan-color-action-hover": "rgba(221, 226, 233, 0.12)",
    });
    expect(Object.keys(variables)).toEqual([
      "--yishan-color-background-app",
      "--yishan-color-action-selected",
      "--yishan-color-action-hover",
    ]);
  });

  it("exposes the versioned factory through the latest CSS subpath alias", () => {
    expect(createLatestCssThemeVariables("dark")).toEqual(createCssThemeVariables("dark"));
  });
});
