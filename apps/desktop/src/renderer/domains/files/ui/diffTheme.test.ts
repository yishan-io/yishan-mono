import { readFileSync } from "node:fs";
import { resolveCodeTheme } from "@renderer/ui/codeThemes";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { describe, expect, it } from "vitest";
import {
  EDITOR_COLORS,
  buildOverriddenRules,
  getDiffCssVariables,
  getDiffCssVariablesForPalette,
  pickTokenForeground,
  resolveTokenFontStyle,
} from "./diffTheme";

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

describe("pickTokenForeground", () => {
  const palette = resolveCodeTheme("yishan", "dark");
  const gitDiff = SEMANTIC_COLOR_TOKENS.dark.gitDiff;

  const cases: [string, string[], string][] = [
    ["entity.name.function", ["entity.name.function"], palette.variable],
    ["keyword.operator.arithmetic.js", ["keyword.operator.arithmetic.js"], palette.operator],
    ["constant.numeric", ["constant.numeric"], palette.number],
    ["entity.other.attribute-name", ["entity.other.attribute-name"], palette.attribute],
    ["storage.type.ts", ["storage.type.ts"], palette.keyword],
    ["identifier", ["identifier"], palette.foreground],
    ["markup.deleted.diff", ["markup.deleted.diff"], gitDiff.deleted],
    ["punctuation.definition.string.begin", ["punctuation.definition.string.begin"], palette.string],
    ["comment.block", ["comment.block"], palette.comment],
    ["support.function.console", ["support.function.console"], palette.variable],
    ["variable.other.constant", ["variable.other.constant"], palette.variable],
    ["markup.heading.markdown", ["markup.heading.markdown"], palette.keyword],
    ["entity.name.section.markdown", ["entity.name.section.markdown"], palette.keyword],
    ["markup.inserted.diff", ["markup.inserted.diff"], gitDiff.added],
    ["markup.changed.diff", ["markup.changed.diff"], gitDiff.modified],
    ["punctuation.definition.bold.markdown", ["punctuation.definition.bold.markdown"], palette.foreground],
    ["keyword.operator.assignment.ts", ["keyword.operator.assignment.ts"], palette.operator],
    ["storage", ["storage"], palette.keyword],
    ["variable.parameter.function.js", ["variable.parameter.function.js"], palette.variable],
    ["markup.inline.raw.markdown", ["markup.inline.raw.markdown"], palette.string],
    ["markup.underline.link.markdown", ["markup.underline.link.markdown"], palette.string],
    ["storage.modifier.ts", ["storage.modifier.ts"], palette.keyword],
    ["source.java", ["source.java"], palette.foreground],
    // yaml keys converge on Monaco's Monarch "type" token
    ["entity.name.tag.yaml", ["entity.name.tag.yaml"], palette.type],
    // booleans / null / undefined converge on Monaco's Monarch keywords
    ["constant.language.boolean.yaml", ["constant.language.boolean.yaml"], palette.keyword],
    ["constant.language.null.js", ["constant.language.null.js"], palette.keyword],
    ["constant.language.undefined.ts", ["constant.language.undefined.ts"], palette.keyword],
    ["constant.numeric.integer.yaml", ["constant.numeric.integer.yaml"], palette.number],
    ["constant.language.merge.yaml", ["constant.language.merge.yaml"], palette.keyword],
  ];

  it.each(cases)("%s → expected color", (_label, scopes, expected) => {
    expect(pickTokenForeground(scopes, palette, gitDiff)).toBe(expected);
  });
});

describe("resolveTokenFontStyle", () => {
  it.each([
    ["markup.bold", undefined, "bold"],
    ["markup.bold.markdown", undefined, "bold"],
    ["punctuation.definition.bold.markdown", undefined, "bold"],
    ["markup.italic.markdown", undefined, "italic"],
    ["punctuation.definition.italic.markdown", undefined, "italic"],
    ["markup.bold", "italic", "bold italic"],
    ["comment.block", "italic", "italic"],
    ["source.java", undefined, undefined],
  ] as const)("%s + %s → %s", (scope, original, expected) => {
    expect(resolveTokenFontStyle([scope], original)).toBe(expected);
  });
});

describe("buildOverriddenRules", () => {
  const palette = resolveCodeTheme("yishan", "dark");
  const gitDiff = SEMANTIC_COLOR_TOKENS.dark.gitDiff;

  it("splits multi-scope rules so each token family gets its own palette color", () => {
    const rules = buildOverriddenRules(
      [{ scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: "#1ca1c7" } }],
      palette,
      gitDiff,
    );

    expect(rules).toHaveLength(15); // 2 split + 12 appended extra rules
    expect(rules[0]).toMatchObject({ scope: "constant.numeric", settings: { foreground: palette.number } });
    expect(rules[1]).toMatchObject({ scope: "constant.language.boolean", settings: { foreground: palette.keyword } });
    // appended extra rules cover token scopes pierre's base theme never scopes
    const yamlKeyRule = rules.find((r) => r.scope === "entity.name.tag.yaml");
    expect(yamlKeyRule?.settings?.foreground).toBe(palette.type);
    const arrowRule = rules.find((r) => r.scope === "storage.type.function.arrow");
    expect(arrowRule?.settings?.foreground).toBe(palette.delimiter);
  });

  it("pins the global (no-scope) rule to the palette foreground", () => {
    const rules = buildOverriddenRules([{ settings: { foreground: "#000000" } }], palette, gitDiff);

    expect(rules[0]?.settings?.foreground).toBe(palette.foreground);
  });

  it("keeps markdown bold fontStyle on the markup.bold rule", () => {
    const rules = buildOverriddenRules(
      [{ scope: "markup.bold", settings: { foreground: "#ffd452" } }],
      palette,
      gitDiff,
    );

    expect(rules[0]?.settings?.fontStyle).toBe("bold");
  });
});
