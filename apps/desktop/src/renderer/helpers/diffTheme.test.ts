import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveCodeTheme } from "./codeThemes";
import { EDITOR_COLORS, getDiffCssVariables, getDiffCssVariablesForPalette } from "./diffTheme";

describe("diff theme git status colors", () => {
  it("derives light colors from SEMANTIC_COLOR_TOKENS", () => {
    const source = readFileSync(new URL("./diffTheme.ts", import.meta.url), "utf8");

    expect(source).toContain("addition: SEMANTIC_COLOR_TOKENS.light.gitDiff.added");
    expect(source).toContain("modified: SEMANTIC_COLOR_TOKENS.dark.gitDiff.modified");
    expect(source).toContain("comment: SEMANTIC_COLOR_TOKENS.light.syntax.comment");
    expect(source).toContain("keyword: SEMANTIC_COLOR_TOKENS.dark.syntax.keyword");
  });

  it("preserves exact git diff colors and derived alpha fills", () => {
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

  it("getDiffCssVariables matches getDiffCssVariablesForPalette for yishan family", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = resolveCodeTheme("yishan", mode);
      expect(getDiffCssVariablesForPalette(palette, mode)).toEqual(getDiffCssVariables(mode));
    }
  });

  it("getDiffCssVariablesForPalette uses palette surface colors", () => {
    const palette = resolveCodeTheme("yishan", "light");
    const vars = getDiffCssVariablesForPalette(palette, "light");

    expect(vars["--diffs-bg"]).toBe(palette.background);
    expect(vars["--diffs-fg"]).toBe(palette.foreground);
    expect(vars["--diffs-bg-context-override"]).toBe(palette.lineHighlight);
    expect(vars["--diffs-bg-context-gutter-override"]).toBe(palette.gutter);
    expect(vars["--diffs-bg-separator-override"]).toBe(palette.gutter);
    expect(vars["--diffs-fg-number-override"]).toBe(palette.lineNumber);
    expect(vars["--diffs-bg-selection-override"]).toBe(palette.selection);
  });
});
