import { registerCustomTheme } from "@pierre/diffs";
import pierreDark from "@pierre/theme/pierre-dark";
import pierreLight from "@pierre/theme/pierre-light";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { CODE_THEME_FAMILIES, type CodeThemePalette, getMonacoThemeName, resolveCodeTheme } from "./codeThemes";

// ---------------------------------------------------------------------------
// EDITOR_COLORS — derived from SEMANTIC_COLOR_TOKENS (same values as before)
// ---------------------------------------------------------------------------

export const EDITOR_COLORS = {
  light: {
    background: SEMANTIC_COLOR_TOKENS.light.background.editor,
    foreground: SEMANTIC_COLOR_TOKENS.light.editor.foreground,
    lineHighlight: SEMANTIC_COLOR_TOKENS.light.editor.lineHighlight,
    selection: SEMANTIC_COLOR_TOKENS.light.editor.selection,
    lineNumber: SEMANTIC_COLOR_TOKENS.light.editor.lineNumber,
    gutter: SEMANTIC_COLOR_TOKENS.light.editor.gutter,
    cursor: SEMANTIC_COLOR_TOKENS.light.editor.cursor,
    addition: SEMANTIC_COLOR_TOKENS.light.gitDiff.added,
    deletion: SEMANTIC_COLOR_TOKENS.light.gitDiff.deleted,
    modified: SEMANTIC_COLOR_TOKENS.light.gitDiff.modified,
    comment: SEMANTIC_COLOR_TOKENS.light.syntax.comment,
    keyword: SEMANTIC_COLOR_TOKENS.light.syntax.keyword,
    string: SEMANTIC_COLOR_TOKENS.light.syntax.string,
    number: SEMANTIC_COLOR_TOKENS.light.syntax.number,
    constant: SEMANTIC_COLOR_TOKENS.light.syntax.constant,
    function: SEMANTIC_COLOR_TOKENS.light.syntax.function,
    type: SEMANTIC_COLOR_TOKENS.light.syntax.type,
    tag: SEMANTIC_COLOR_TOKENS.light.syntax.tag,
    attributeName: SEMANTIC_COLOR_TOKENS.light.syntax.attribute,
    operator: SEMANTIC_COLOR_TOKENS.light.syntax.operator,
  },
  dark: {
    background: SEMANTIC_COLOR_TOKENS.dark.background.editor,
    foreground: SEMANTIC_COLOR_TOKENS.dark.editor.foreground,
    lineHighlight: SEMANTIC_COLOR_TOKENS.dark.editor.lineHighlight,
    selection: SEMANTIC_COLOR_TOKENS.dark.editor.selection,
    lineNumber: SEMANTIC_COLOR_TOKENS.dark.editor.lineNumber,
    gutter: SEMANTIC_COLOR_TOKENS.dark.editor.gutter,
    cursor: SEMANTIC_COLOR_TOKENS.dark.editor.cursor,
    addition: SEMANTIC_COLOR_TOKENS.dark.gitDiff.added,
    deletion: SEMANTIC_COLOR_TOKENS.dark.gitDiff.deleted,
    modified: SEMANTIC_COLOR_TOKENS.dark.gitDiff.modified,
    comment: SEMANTIC_COLOR_TOKENS.dark.syntax.comment,
    keyword: SEMANTIC_COLOR_TOKENS.dark.syntax.keyword,
    string: SEMANTIC_COLOR_TOKENS.dark.syntax.string,
    number: SEMANTIC_COLOR_TOKENS.dark.syntax.number,
    constant: SEMANTIC_COLOR_TOKENS.dark.syntax.constant,
    function: SEMANTIC_COLOR_TOKENS.dark.syntax.function,
    type: SEMANTIC_COLOR_TOKENS.dark.syntax.type,
    tag: SEMANTIC_COLOR_TOKENS.dark.syntax.tag,
    attributeName: SEMANTIC_COLOR_TOKENS.dark.syntax.attribute,
    operator: SEMANTIC_COLOR_TOKENS.dark.syntax.operator,
  },
} as const;

export type EditorColorMode = keyof typeof EDITOR_COLORS;

// ---------------------------------------------------------------------------
// Aliases kept for existing consumers (Tasks 5–6 migrate them)
// ---------------------------------------------------------------------------

export const YISHAN_DIFF_THEME_LIGHT = "yishan-light";
export const YISHAN_DIFF_THEME_DARK = "yishan-dark";

// ---------------------------------------------------------------------------
// Pierre theme builder — maps palette colors to TextMate scopes
// ---------------------------------------------------------------------------

function matchScope(scopes: string | string[] | undefined, pattern: string): boolean {
  if (!scopes) return false;
  const list = Array.isArray(scopes) ? scopes : [scopes];
  return list.some((s) => {
    const atoms = s.split(" ");
    return atoms.some((atom) => {
      if (atom === pattern || atom.startsWith(`${pattern}.`)) return true;
      // Match any dot-separated segment (e.g. "entity.name.function" matches "function")
      return atom.split(".").some((seg) => seg === pattern);
    });
  });
}

export function pickTokenForeground(
  scopes: string | string[] | undefined,
  palette: CodeThemePalette,
  gitDiff: { added: string; deleted: string; modified: string },
): string {
  // 1. comment
  if (matchScope(scopes, "comment")) return palette.comment;
  // 2. git diff markers
  if (matchScope(scopes, "markup.deleted.diff")) return gitDiff.deleted;
  if (matchScope(scopes, "markup.inserted.diff")) return gitDiff.added;
  if (matchScope(scopes, "markup.changed.diff")) return gitDiff.modified;
  // 3. punctuation.definition.string (before plain string)
  if (matchScope(scopes, "punctuation.definition.string")) return palette.string;
  // 4. string
  if (matchScope(scopes, "string")) return palette.string;
  // 5. keyword.operator (before keyword)
  if (matchScope(scopes, "keyword.operator")) return palette.operator;
  // 6. constant.numeric / number / numeric (before constant)
  if (matchScope(scopes, "constant.numeric") || matchScope(scopes, "number") || matchScope(scopes, "numeric"))
    return palette.number;
  // 7. constant
  if (matchScope(scopes, "constant")) return palette.constant;
  // 8. keyword
  if (matchScope(scopes, "keyword")) return palette.keyword;
  // 9. storage.modifier
  if (matchScope(scopes, "storage.modifier")) return palette.keyword;
  // 9b. parameters are variables (variable.parameter.*, function.parameter.*) — BEFORE function
  if (matchScope(scopes, "parameter")) return palette.variable;
  // 10. function
  if (matchScope(scopes, "function")) return palette.function;
  // 11. heading (markup.heading + entity.name.section — the real ATX heading-text scope)
  if (matchScope(scopes, "heading") || matchScope(scopes, "entity.name.section")) return palette.keyword;
  // 12. type / class
  if (matchScope(scopes, "type") || matchScope(scopes, "class")) return palette.type;
  // 13. tag
  if (matchScope(scopes, "tag")) return palette.tag;
  // 14. attribute / attribute-name
  if (matchScope(scopes, "attribute") || matchScope(scopes, "attribute-name")) return palette.attribute;
  // 15a. variable.other.constant (before plain variable)
  if (matchScope(scopes, "variable.other.constant")) return palette.constant;
  // 15b. variable
  if (matchScope(scopes, "variable")) return palette.variable;
  // 16. markup.inline.raw / markup.underline.link
  if (matchScope(scopes, "markup.inline.raw") || matchScope(scopes, "markup.underline.link")) return palette.string;
  // 17. punctuation → delimiter
  if (matchScope(scopes, "punctuation")) return palette.delimiter;
  // 18. operator
  if (matchScope(scopes, "operator")) return palette.operator;
  // 19. storage
  if (matchScope(scopes, "storage")) return palette.keyword;
  // 20. default
  return palette.foreground;
}

type ThemeRule = {
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
};

function overrideFgColors(
  settings: ThemeRule[],
  palette: CodeThemePalette,
  gitDiff: { added: string; deleted: string; modified: string },
) {
  return settings.map((rule) => {
    const fg = pickTokenForeground(rule.scope, palette, gitDiff);
    return {
      ...rule,
      settings: rule.settings
        ? { ...rule.settings, foreground: fg, background: rule.settings.background }
        : { foreground: fg },
    };
  });
}

function buildTheme(name: string, mode: "light" | "dark", raw: unknown, p: CodeThemePalette): Record<string, unknown> {
  const base = raw as Record<string, unknown>;
  const baseSettings = (base.settings || base.tokenColors) as ThemeRule[];
  const gitDiff = SEMANTIC_COLOR_TOKENS[mode].gitDiff;
  const theme: Record<string, unknown> = {
    ...base,
    name,
    type: mode,
    colors: {
      ...(base.colors as Record<string, string>),
      "editor.foreground": p.foreground,
      "editor.background": p.background,
      "gitDecoration.addedResourceForeground": gitDiff.added,
      "gitDecoration.deletedResourceForeground": gitDiff.deleted,
      "gitDecoration.modifiedResourceForeground": gitDiff.modified,
    },
    settings: baseSettings
      ? overrideFgColors(baseSettings, p, {
          added: gitDiff.added,
          deleted: gitDiff.deleted,
          modified: gitDiff.modified,
        })
      : [],
  };
  theme.tokenColors = undefined;
  return theme;
}

// ---------------------------------------------------------------------------
// Register all family × mode Pierre diff themes
// ---------------------------------------------------------------------------

for (const family of CODE_THEME_FAMILIES) {
  for (const mode of ["light", "dark"] as const) {
    const palette = family.palettes[mode];
    const pierreBase = mode === "dark" ? pierreDark : pierreLight;

    registerCustomTheme(getMonacoThemeName(family.id, mode), () =>
      Promise.resolve(buildTheme(getMonacoThemeName(family.id, mode), mode, pierreBase, palette)),
    );
  }
}

// ---------------------------------------------------------------------------
// CSS variable helpers for diff viewers
// ---------------------------------------------------------------------------

export function getDiffCssVariables(mode: EditorColorMode): Record<string, string> {
  const palette = resolveCodeTheme("yishan", mode);
  return getDiffCssVariablesForPalette(palette, mode);
}

export function getDiffCssVariablesForPalette(
  palette: CodeThemePalette,
  mode: "light" | "dark",
): Record<string, string> {
  const gitDiff = SEMANTIC_COLOR_TOKENS[mode].gitDiff;
  return {
    "--diffs-bg": palette.background,
    "--diffs-fg": palette.foreground,
    "--diffs-bg-context-override": palette.lineHighlight,
    "--diffs-bg-context-gutter-override": palette.gutter,
    "--diffs-bg-separator-override": palette.gutter,
    "--diffs-fg-number-override": palette.lineNumber,
    "--diffs-bg-selection-override": palette.selection,
    "--diffs-addition-color-override": gitDiff.added,
    "--diffs-deletion-color-override": gitDiff.deleted,
    "--diffs-modified-color-override": gitDiff.modified,
    "--diffs-bg-addition-override": `${gitDiff.added}22`,
    "--diffs-bg-addition-emphasis-override": `${gitDiff.added}33`,
    "--diffs-bg-deletion-override": `${gitDiff.deleted}22`,
    "--diffs-bg-deletion-emphasis-override": `${gitDiff.deleted}33`,
  };
}
