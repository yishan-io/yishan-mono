import type { CodeThemePalette } from "../../../helpers/codeThemes";

export type MonacoThemeRule = {
  token: string;
  foreground?: string;
  fontStyle?: string;
};

/**
 * Builds the Monaco theme rule list for a palette. Rules are ordered from least
 * to most specific within each family, and the list includes explicit shadow
 * rules for the token types where Monaco's builtin base themes (vs / vs-dark)
 * define MORE specific rules than ours (e.g. `string.yaml`, `delimiter.html`,
 * `metatag.html`). Without those, the base rules would win Monaco's
 * longest-prefix matching and the editor would render base-theme colors for
 * those tokens instead of the palette.
 */
export function buildMonacoThemeRules(palette: CodeThemePalette): MonacoThemeRule[] {
  return [
    // ── core palette mapping (most token families) ──────────────────────
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
    // ── base-theme shadow rules (more specific than the core rules above) ─
    // string variants
    { token: "string.yaml", foreground: palette.string.slice(1) },
    { token: "string.html", foreground: palette.string.slice(1) },
    { token: "string.sql", foreground: palette.string.slice(1) },
    { token: "string.key.json", foreground: palette.string.slice(1) },
    { token: "string.value.json", foreground: palette.string.slice(1) },
    // attribute values (css/html) are strings in the palette
    { token: "attribute.value.html", foreground: palette.string.slice(1) },
    { token: "attribute.value.xml", foreground: palette.string.slice(1) },
    { token: "attribute.value.number", foreground: palette.string.slice(1) },
    { token: "attribute.value.unit", foreground: palette.string.slice(1) },
    // delimiters / numbers / keywords / tags / variables with base variants
    { token: "delimiter.html", foreground: palette.delimiter.slice(1) },
    { token: "delimiter.xml", foreground: palette.delimiter.slice(1) },
    { token: "number.hex", foreground: palette.number.slice(1) },
    { token: "keyword.flow", foreground: palette.keyword.slice(1) },
    { token: "keyword.flow.scss", foreground: palette.keyword.slice(1) },
    { token: "keyword.json", foreground: palette.keyword.slice(1) },
    { token: "tag.class.pug", foreground: palette.tag.slice(1) },
    { token: "tag.id.pug", foreground: palette.tag.slice(1) },
    { token: "variable.predefined", foreground: palette.variable.slice(1) },
    { token: "operator.scss", foreground: palette.operator.slice(1) },
    { token: "operator.sql", foreground: palette.operator.slice(1) },
    { token: "operator.swift", foreground: palette.operator.slice(1) },
    // metatags (doctype, shebang, php/xml headers) render in the default foreground
    { token: "metatag", foreground: palette.foreground.slice(1) },
    { token: "metatag.html", foreground: palette.foreground.slice(1) },
    { token: "metatag.content.html", foreground: palette.foreground.slice(1) },
    { token: "metatag.php", foreground: palette.foreground.slice(1) },
    { token: "metatag.xml", foreground: palette.foreground.slice(1) },
    // ── default ──────────────────────────────────────────────────────────
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
