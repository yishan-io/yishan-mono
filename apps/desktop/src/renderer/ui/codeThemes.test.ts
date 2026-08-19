import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { describe, expect, it } from "vitest";
import {
  CODE_THEME_FAMILIES,
  getCodeThemeFamily,
  getMonacoThemeName,
  isDarkMode,
  resolveCodeTheme,
} from "./codeThemes";
import type { CodeThemeFamilyId, CodeThemePalette } from "./codeThemes";

const ALL_FAMILY_IDS: CodeThemeFamilyId[] = ["yishan", "one-dark", "dracula", "github", "tokyo-night"];

const PALETTE_KEYS: (keyof CodeThemePalette)[] = [
  "foreground",
  "background",
  "lineHighlight",
  "selection",
  "lineNumber",
  "gutter",
  "cursor",
  "comment",
  "keyword",
  "string",
  "number",
  "constant",
  "function",
  "type",
  "tag",
  "attribute",
  "operator",
  "delimiter",
  "variable",
];

describe("getCodeThemeFamily", () => {
  it("resolves all 5 families by id", () => {
    for (const id of ALL_FAMILY_IDS) {
      const family = getCodeThemeFamily(id);
      expect(family.id).toBe(id);
    }
  });

  it("throws for an unknown id", () => {
    expect(() => getCodeThemeFamily("unknown" as CodeThemeFamilyId)).toThrow("Unknown code theme family: unknown");
  });
});

describe("CODE_THEME_FAMILIES", () => {
  it("has 5 entries in correct order", () => {
    expect(CODE_THEME_FAMILIES).toHaveLength(5);
    const ids = CODE_THEME_FAMILIES.map((f) => f.id);
    expect(ids).toEqual(["yishan", "one-dark", "dracula", "github", "tokyo-night"]);
  });

  it("has correct labels", () => {
    const labels = CODE_THEME_FAMILIES.map((f) => f.label);
    expect(labels).toEqual(["Yishan", "One Dark", "Dracula", "GitHub", "Tokyo Night"]);
  });

  it("every family has both light and dark palettes", () => {
    for (const family of CODE_THEME_FAMILIES) {
      expect(family.palettes.light).toBeDefined();
      expect(family.palettes.dark).toBeDefined();
    }
  });
});

describe("yishan palettes align with SEMANTIC_COLOR_TOKENS", () => {
  it("light palette matches design tokens key-for-key", () => {
    const palette = resolveCodeTheme("yishan", "light");
    const tokens = SEMANTIC_COLOR_TOKENS.light;
    expect(palette.background).toBe(tokens.background.editor);
    expect(palette.foreground).toBe(tokens.editor.foreground);
    expect(palette.lineHighlight).toBe(tokens.editor.lineHighlight);
    expect(palette.selection).toBe(tokens.editor.selection);
    expect(palette.lineNumber).toBe(tokens.editor.lineNumber);
    expect(palette.gutter).toBe(tokens.editor.gutter);
    expect(palette.cursor).toBe(tokens.editor.cursor);
    expect(palette.comment).toBe(tokens.syntax.comment);
    expect(palette.keyword).toBe(tokens.syntax.keyword);
    expect(palette.string).toBe(tokens.syntax.string);
    expect(palette.number).toBe(tokens.syntax.number);
    expect(palette.constant).toBe(tokens.syntax.constant);
    expect(palette.function).toBe(tokens.syntax.function);
    expect(palette.type).toBe(tokens.syntax.type);
    expect(palette.tag).toBe(tokens.syntax.tag);
    expect(palette.attribute).toBe(tokens.syntax.attribute);
    expect(palette.operator).toBe(tokens.syntax.operator);
    expect(palette.delimiter).toBe(tokens.syntax.delimiter);
    expect(palette.variable).toBe(tokens.syntax.variable);
  });

  it("dark palette matches design tokens key-for-key", () => {
    const palette = resolveCodeTheme("yishan", "dark");
    const tokens = SEMANTIC_COLOR_TOKENS.dark;
    expect(palette.background).toBe(tokens.background.editor);
    expect(palette.foreground).toBe(tokens.editor.foreground);
    expect(palette.lineHighlight).toBe(tokens.editor.lineHighlight);
    expect(palette.selection).toBe(tokens.editor.selection);
    expect(palette.lineNumber).toBe(tokens.editor.lineNumber);
    expect(palette.gutter).toBe(tokens.editor.gutter);
    expect(palette.cursor).toBe(tokens.editor.cursor);
    expect(palette.comment).toBe(tokens.syntax.comment);
    expect(palette.keyword).toBe(tokens.syntax.keyword);
    expect(palette.string).toBe(tokens.syntax.string);
    expect(palette.number).toBe(tokens.syntax.number);
    expect(palette.constant).toBe(tokens.syntax.constant);
    expect(palette.function).toBe(tokens.syntax.function);
    expect(palette.type).toBe(tokens.syntax.type);
    expect(palette.tag).toBe(tokens.syntax.tag);
    expect(palette.attribute).toBe(tokens.syntax.attribute);
    expect(palette.operator).toBe(tokens.syntax.operator);
    expect(palette.delimiter).toBe(tokens.syntax.delimiter);
    expect(palette.variable).toBe(tokens.syntax.variable);
  });
});

describe("resolveCodeTheme", () => {
  it("picks light variant for a community family", () => {
    const palette = resolveCodeTheme("dracula", "light");
    expect(palette.background).toBe("#f8f8f2");
    expect(palette.foreground).toBe("#44475a");
  });

  it("picks dark variant for a community family", () => {
    const palette = resolveCodeTheme("one-dark", "dark");
    expect(palette.background).toBe("#282c34");
    expect(palette.foreground).toBe("#abb2bf");
  });
});

describe("palette completeness", () => {
  it.each(ALL_FAMILY_IDS)("%s light palette has all 19 keys defined", (familyId) => {
    const palette = resolveCodeTheme(familyId, "light");
    for (const key of PALETTE_KEYS) {
      const value = palette[key];
      expect(value, `key "${key}" missing or empty in ${familyId} light`).toBeTruthy();
      expect(typeof value, `key "${key}" not a string in ${familyId} light`).toBe("string");
    }
  });

  it.each(ALL_FAMILY_IDS)("%s dark palette has all 19 keys defined", (familyId) => {
    const palette = resolveCodeTheme(familyId, "dark");
    for (const key of PALETTE_KEYS) {
      const value = palette[key];
      expect(value, `key "${key}" missing or empty in ${familyId} dark`).toBeTruthy();
      expect(typeof value, `key "${key}" not a string in ${familyId} dark`).toBe("string");
    }
  });
});

describe("getMonacoThemeName", () => {
  it("generates unique names across all (family, mode) pairs", () => {
    const names: string[] = [];
    for (const id of ALL_FAMILY_IDS) {
      for (const mode of ["light", "dark"] as const) {
        names.push(getMonacoThemeName(id, mode));
      }
    }
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("returns expected $familyId-$mode format", () => {
    expect(getMonacoThemeName("yishan", "dark")).toBe("yishan-dark");
    expect(getMonacoThemeName("one-dark", "dark")).toBe("one-dark-dark");
    expect(getMonacoThemeName("github", "light")).toBe("github-light");
    expect(getMonacoThemeName("tokyo-night", "light")).toBe("tokyo-night-light");
  });
});

describe("isDarkMode", () => {
  it("returns true for dark", () => {
    expect(isDarkMode("dark")).toBe(true);
  });

  it("returns false for light", () => {
    expect(isDarkMode("light")).toBe(false);
  });
});
