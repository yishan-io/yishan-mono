import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_COLORS, getDiffCssVariables } from "./diffTheme";

describe("diff theme git status colors", () => {
  it("maps both Pierre themes from shared git diff tokens", () => {
    const source = readFileSync(new URL("./diffTheme.ts", import.meta.url), "utf8");

    expect(source).toContain('import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens"');
    expect(source).toContain("addition: SEMANTIC_COLOR_TOKENS.light.gitDiff.added");
    expect(source).toContain("modified: SEMANTIC_COLOR_TOKENS.dark.gitDiff.modified");
  });

  it("preserves exact Pierre overrides and derived alpha fills", () => {
    expect(EDITOR_COLORS.light.addition).toBe("#2ea043");
    expect(EDITOR_COLORS.light.modified).toBe("#1a7fd4");
    expect(EDITOR_COLORS.light.deletion).toBe("#f85149");
    expect(EDITOR_COLORS.dark.addition).toBe("#3fb950");
    expect(EDITOR_COLORS.dark.modified).toBe("#58a6ff");
    expect(EDITOR_COLORS.dark.deletion).toBe("#f85149");
    expect(getDiffCssVariables("light")).toMatchObject({
      "--diffs-addition-color-override": "#2ea043",
      "--diffs-deletion-color-override": "#f85149",
      "--diffs-modified-color-override": "#1a7fd4",
      "--diffs-bg-addition-override": "#2ea04322",
      "--diffs-bg-addition-emphasis-override": "#2ea04333",
      "--diffs-bg-deletion-override": "#f8514922",
      "--diffs-bg-deletion-emphasis-override": "#f8514933",
    });
    expect(getDiffCssVariables("dark")).toMatchObject({
      "--diffs-addition-color-override": "#3fb950",
      "--diffs-deletion-color-override": "#f85149",
      "--diffs-modified-color-override": "#58a6ff",
      "--diffs-bg-addition-override": "#3fb95022",
      "--diffs-bg-addition-emphasis-override": "#3fb95033",
      "--diffs-bg-deletion-override": "#f8514922",
      "--diffs-bg-deletion-emphasis-override": "#f8514933",
    });
  });
});
