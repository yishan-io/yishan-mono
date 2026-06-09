import { registerCustomTheme } from "@pierre/diffs";
import pierreDark from "@pierre/theme/pierre-dark";
import pierreLight from "@pierre/theme/pierre-light";
import { DARK_SURFACE_COLORS } from "../theme";

export const EDITOR_COLORS = {
  light: {
    background: "#ffffff",
    foreground: "#1f2430",
    lineHighlight: "#f1f3f7",
    selection: "#ced7ec",
    lineNumber: "#7a8190",
    gutter: "#f5f6f8",
    cursor: "#2a2a31",
    addition: "#2ea043",
    deletion: "#f85149",
    modified: "#1a7fd4",
    comment: "#7a8190",
    keyword: "#8a3ffc",
    string: "#2d7a00",
    number: "#bd5500",
    constant: "#9a6100",
    function: "#0060b8",
    type: "#006b99",
    tag: "#b04900",
    attributeName: "#0b6ea8",
    operator: "#3f4758",
  },
  dark: {
    background: DARK_SURFACE_COLORS.mainPane,
    foreground: "#d4dbe8",
    lineHighlight: DARK_SURFACE_COLORS.activeLine,
    selection: "#dde2e91f",
    lineNumber: "#8e97ab",
    gutter: DARK_SURFACE_COLORS.gutter,
    cursor: "#d7deef",
    addition: "#3fb950",
    deletion: "#f85149",
    modified: "#58a6ff",
    comment: "#7f8796",
    keyword: "#c49fff",
    string: "#a7d56d",
    number: "#ffa86f",
    constant: "#ffd57a",
    function: "#79c4ff",
    type: "#8ad9ff",
    tag: "#ffb86b",
    attributeName: "#86d0ff",
    operator: "#c0c8d8",
  },
} as const;

export type EditorColorMode = keyof typeof EDITOR_COLORS;

export const YISHAN_DIFF_THEME_LIGHT = "yishan-diff-light";
export const YISHAN_DIFF_THEME_DARK = "yishan-diff-dark";

type EC = (typeof EDITOR_COLORS)[EditorColorMode];

function matchScope(scopes: string | string[] | undefined, pattern: string): boolean {
  if (!scopes) return false;
  const list = Array.isArray(scopes) ? scopes : [scopes];
  return list.some((s) => {
    const atoms = s.split(" ");
    return atoms.some((atom) => atom === pattern || atom.startsWith(`${pattern}.`));
  });
}

function pickFg(scopes: string | string[] | undefined, c: EC): string | undefined {
  const isMarkdown = matchScope(scopes, "markdown");
  if (matchScope(scopes, "comment")) return c.comment;
  if (matchScope(scopes, "string")) return c.string;
  if (matchScope(scopes, "keyword")) return c.keyword;
  if (matchScope(scopes, "number") || matchScope(scopes, "numeric")) return c.number;
  if (matchScope(scopes, "constant")) return c.constant;
  if (matchScope(scopes, "function")) return c.function;
  if (matchScope(scopes, "heading")) return c.keyword;
  if (matchScope(scopes, "type") || matchScope(scopes, "class")) return c.type;
  if (matchScope(scopes, "tag")) return c.tag;
  if (matchScope(scopes, "attribute")) return c.attributeName;
  if (!isMarkdown && (matchScope(scopes, "operator") || matchScope(scopes, "punctuation"))) return c.operator;
  return undefined;
}

type ThemeRule = {
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
};

function overrideFgColors(settings: ThemeRule[], c: EC) {
  return settings.map((rule) => {
    const fg = pickFg(rule.scope, c) ?? rule.settings?.foreground;
    return {
      ...rule,
      settings: rule.settings
        ? { ...rule.settings, foreground: fg, background: rule.settings.background }
        : { foreground: fg },
    };
  });
}

function buildTheme(name: string, mode: "light" | "dark", raw: unknown, c: EC): Record<string, unknown> {
  const base = raw as Record<string, unknown>;
  const baseSettings = (base.settings || base.tokenColors) as ThemeRule[];
  const theme: Record<string, unknown> = {
    ...base,
    name,
    type: mode,
    colors: {
      ...(base.colors as Record<string, string>),
      "editor.foreground": c.foreground,
      "editor.background": c.background,
      "gitDecoration.addedResourceForeground": c.addition,
      "gitDecoration.deletedResourceForeground": c.deletion,
      "gitDecoration.modifiedResourceForeground": c.modified,
    },
    settings: baseSettings ? overrideFgColors(baseSettings, c) : [],
  };
  theme.tokenColors = undefined;
  return theme;
}

registerCustomTheme(YISHAN_DIFF_THEME_DARK, () =>
  Promise.resolve(buildTheme(YISHAN_DIFF_THEME_DARK, "dark", pierreDark, EDITOR_COLORS.dark)),
);

registerCustomTheme(YISHAN_DIFF_THEME_LIGHT, () =>
  Promise.resolve(buildTheme(YISHAN_DIFF_THEME_LIGHT, "light", pierreLight, EDITOR_COLORS.light)),
);

export function getDiffCssVariables(mode: EditorColorMode): Record<string, string> {
  const c = EDITOR_COLORS[mode];
  return {
    "--diffs-bg": c.background,
    "--diffs-fg": c.foreground,
    "--diffs-bg-context-override": c.lineHighlight,
    "--diffs-bg-context-gutter-override": c.gutter,
    "--diffs-bg-separator-override": c.gutter,
    "--diffs-fg-number-override": c.lineNumber,
    "--diffs-bg-selection-override": c.selection,
    "--diffs-addition-color-override": c.addition,
    "--diffs-deletion-color-override": c.deletion,
    "--diffs-modified-color-override": c.modified,
    "--diffs-bg-addition-override": `${c.addition}22`,
    "--diffs-bg-addition-emphasis-override": `${c.addition}33`,
    "--diffs-bg-deletion-override": `${c.deletion}22`,
    "--diffs-bg-deletion-emphasis-override": `${c.deletion}33`,
  };
}
