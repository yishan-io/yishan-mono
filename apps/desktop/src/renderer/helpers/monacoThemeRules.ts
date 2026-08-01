import type { CodeThemePalette } from "./codeThemes";

export type MonacoThemeRule = {
  token: string;
  foreground?: string;
  fontStyle?: string;
};

/**
 * Builds the Monaco theme rule list for a palette. The comparator script
 * (scripts/compareSyntaxThemes.mjs) uses this same list so Monaco-side colors
 * in the comparison always match what the app actually registers.
 */
export function buildMonacoThemeRules(palette: CodeThemePalette): MonacoThemeRule[] {
  return [
    { token: "comment", foreground: palette.comment.slice(1), fontStyle: "italic" },
    { token: "keyword", foreground: palette.keyword.slice(1) },
    { token: "string", foreground: palette.string.slice(1) },
    { token: "number", foreground: palette.number.slice(1) },
    { token: "type", foreground: palette.type.slice(1) },
    { token: "function", foreground: palette.function.slice(1) },
    { token: "variable", foreground: palette.variable.slice(1) },
    { token: "constant", foreground: palette.constant.slice(1) },
    { token: "operator", foreground: palette.operator.slice(1) },
    { token: "delimiter", foreground: palette.delimiter.slice(1) },
    { token: "tag", foreground: palette.tag.slice(1) },
    { token: "attribute.name", foreground: palette.attribute.slice(1) },
    { token: "attribute.value", foreground: palette.string.slice(1) },
    { token: "regexp", foreground: palette.string.slice(1) },
    { token: "", foreground: palette.foreground.slice(1) },
  ];
}

/**
 * Resolves a Monarch token type (e.g. "keyword.operator.js") to the rule's
 * foreground via Monaco's longest-prefix matching, mirroring how Monaco picks
 * a theme rule for a token. Returns a "#rrggbb" hex string (with '#'), falling
 * back to the palette foreground for unmatched tokens.
 */
export function resolveMonacoTokenColor(
  tokenType: string,
  palette: CodeThemePalette,
  rules: MonacoThemeRule[],
): string {
  const parts = tokenType.split(".");
  let bestMatch: MonacoThemeRule | undefined;
  for (let len = parts.length; len >= 0; len--) {
    const prefix = parts.slice(0, len).join(".");
    const rule = rules.find((r) => r.token === prefix);
    if (rule) {
      bestMatch = rule;
      break;
    }
  }
  return bestMatch?.foreground ? `#${bestMatch.foreground}` : palette.foreground;
}
