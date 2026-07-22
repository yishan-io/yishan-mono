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
      "--yishan-color-git-diff-added": "#2ea043",
      "--yishan-color-git-diff-modified": "#1a7fd4",
      "--yishan-color-git-diff-deleted": "#f85149",
      "--yishan-color-git-inline-added-foreground": "#116329",
      "--yishan-color-git-inline-added-background": "#dafbe1",
      "--yishan-color-git-inline-deleted-foreground": "#82071e",
      "--yishan-color-git-inline-deleted-background": "#ffebe9",
      "--yishan-color-git-pierre-fallback-added": "#0dbe4e",
      "--yishan-color-git-pierre-fallback-deleted": "#ff2e3f",
    });
    expect(Object.keys(variables)).toEqual([
      "--yishan-color-background-app",
      "--yishan-color-action-selected",
      "--yishan-color-action-hover",
      "--yishan-color-git-diff-added",
      "--yishan-color-git-diff-modified",
      "--yishan-color-git-diff-deleted",
      "--yishan-color-git-inline-added-foreground",
      "--yishan-color-git-inline-added-background",
      "--yishan-color-git-inline-deleted-foreground",
      "--yishan-color-git-inline-deleted-background",
      "--yishan-color-git-pierre-fallback-added",
      "--yishan-color-git-pierre-fallback-deleted",
    ]);
  });

  it("returns the exact dark-mode semantic variable map", () => {
    const variables = createCssThemeVariables("dark");

    expect(variables).toEqual({
      "--yishan-color-background-app": "#2b3038",
      "--yishan-color-action-selected": "rgba(221, 226, 233, 0.08)",
      "--yishan-color-action-hover": "rgba(221, 226, 233, 0.12)",
      "--yishan-color-git-diff-added": "#3fb950",
      "--yishan-color-git-diff-modified": "#58a6ff",
      "--yishan-color-git-diff-deleted": "#f85149",
      "--yishan-color-git-inline-added-foreground": "#7ee787",
      "--yishan-color-git-inline-added-background": "rgba(63, 185, 80, 0.15)",
      "--yishan-color-git-inline-deleted-foreground": "#ffa198",
      "--yishan-color-git-inline-deleted-background": "rgba(248, 81, 73, 0.15)",
      "--yishan-color-git-pierre-fallback-added": "#0dbe4e",
      "--yishan-color-git-pierre-fallback-deleted": "#ff2e3f",
    });
    expect(Object.keys(variables)).toEqual([
      "--yishan-color-background-app",
      "--yishan-color-action-selected",
      "--yishan-color-action-hover",
      "--yishan-color-git-diff-added",
      "--yishan-color-git-diff-modified",
      "--yishan-color-git-diff-deleted",
      "--yishan-color-git-inline-added-foreground",
      "--yishan-color-git-inline-added-background",
      "--yishan-color-git-inline-deleted-foreground",
      "--yishan-color-git-inline-deleted-background",
      "--yishan-color-git-pierre-fallback-added",
      "--yishan-color-git-pierre-fallback-deleted",
    ]);
  });

  it("exposes the versioned factory through the latest CSS subpath alias", () => {
    expect(createLatestCssThemeVariables("dark")).toEqual(createCssThemeVariables("dark"));
  });
});
