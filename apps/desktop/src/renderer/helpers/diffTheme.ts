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
    return atoms.some((atom) => atom === pattern || atom.startsWith(`${pattern}.`));
  });
}

function pickFg(scopes: string | string[] | undefined, p: CodeThemePalette): string | undefined {
  const isMarkdown = matchScope(scopes, "markdown");
  if (matchScope(scopes, "comment")) return p.comment;
  if (matchScope(scopes, "string")) return p.string;
  if (matchScope(scopes, "keyword")) return p.keyword;
  if (matchScope(scopes, "number") || matchScope(scopes, "numeric")) return p.number;
  if (matchScope(scopes, "constant")) return p.constant;
  if (matchScope(scopes, "function")) return p.function;
  if (matchScope(scopes, "heading")) return p.keyword;
  if (matchScope(scopes, "type") || matchScope(scopes, "class")) return p.type;
  if (matchScope(scopes, "tag")) return p.tag;
  if (matchScope(scopes, "attribute")) return p.attribute;
  if (!isMarkdown && (matchScope(scopes, "operator") || matchScope(scopes, "punctuation"))) return p.operator;
  return undefined;
}

type ThemeRule = {
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
};

function overrideFgColors(settings: ThemeRule[], p: CodeThemePalette) {
  return settings.map((rule) => {
    const fg = pickFg(rule.scope, p) ?? rule.settings?.foreground;
    return {
      ...rule,
      settings: rule.settings
        ? { ...rule.settings, foreground: fg, background: rule.settings.background }
        : { foreground: fg },
    };
  });
}

function buildTheme(
  name: string,
  mode: "light" | "dark",
  raw: unknown,
  p: CodeThemePalette,
  gitDiffTokens: { added: string; deleted: string; modified: string },
): Record<string, unknown> {
  const base = raw as Record<string, unknown>;
  const baseSettings = (base.settings || base.tokenColors) as ThemeRule[];
  const theme: Record<string, unknown> = {
    ...base,
    name,
    type: mode,
    colors: {
      ...(base.colors as Record<string, string>),
      "editor.foreground": p.foreground,
      "editor.background": p.background,
      "gitDecoration.addedResourceForeground": gitDiffTokens.added,
      "gitDecoration.deletedResourceForeground": gitDiffTokens.deleted,
      "gitDecoration.modifiedResourceForeground": gitDiffTokens.modified,
    },
    settings: baseSettings ? overrideFgColors(baseSettings, p) : [],
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
    const gitDiffTokens = SEMANTIC_COLOR_TOKENS[mode].gitDiff;
    const pierreBase = mode === "dark" ? pierreDark : pierreLight;

    registerCustomTheme(getMonacoThemeName(family.id, mode), () =>
      Promise.resolve(
        buildTheme(getMonacoThemeName(family.id, mode), mode, pierreBase, palette, {
          added: gitDiffTokens.added,
          deleted: gitDiffTokens.deleted,
          modified: gitDiffTokens.modified,
        }),
      ),
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
