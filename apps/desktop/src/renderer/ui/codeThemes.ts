import { SEMANTIC_COLOR_TOKENS, TYPOGRAPHY_TOKENS } from "@yishan-io/design-tokens";

export const MONO_FONT_FAMILY = TYPOGRAPHY_TOKENS.monoFontFamily;
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodeThemeFamilyId = "yishan" | "one-dark" | "dracula" | "github" | "tokyo-night";

export interface CodeThemePalette {
  foreground: string;
  background: string;
  lineHighlight: string;
  selection: string;
  lineNumber: string;
  gutter: string;
  cursor: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  constant: string;
  function: string;
  type: string;
  tag: string;
  attribute: string;
  operator: string;
  delimiter: string;
  variable: string;
}

export interface CodeThemeFamily {
  id: CodeThemeFamilyId;
  label: string;
  palettes: {
    light: CodeThemePalette;
    dark: CodeThemePalette;
  };
}

// ---------------------------------------------------------------------------
// Yishan family — sourced from SEMANTIC_COLOR_TOKENS
// ---------------------------------------------------------------------------

const yishanPalettes = {
  light: {
    background: SEMANTIC_COLOR_TOKENS.light.background.editor,
    foreground: SEMANTIC_COLOR_TOKENS.light.editor.foreground,
    lineHighlight: SEMANTIC_COLOR_TOKENS.light.editor.lineHighlight,
    selection: SEMANTIC_COLOR_TOKENS.light.editor.selection,
    lineNumber: SEMANTIC_COLOR_TOKENS.light.editor.lineNumber,
    gutter: SEMANTIC_COLOR_TOKENS.light.editor.gutter,
    cursor: SEMANTIC_COLOR_TOKENS.light.editor.cursor,
    comment: SEMANTIC_COLOR_TOKENS.light.syntax.comment,
    keyword: SEMANTIC_COLOR_TOKENS.light.syntax.keyword,
    string: SEMANTIC_COLOR_TOKENS.light.syntax.string,
    number: SEMANTIC_COLOR_TOKENS.light.syntax.number,
    constant: SEMANTIC_COLOR_TOKENS.light.syntax.constant,
    function: SEMANTIC_COLOR_TOKENS.light.syntax.function,
    type: SEMANTIC_COLOR_TOKENS.light.syntax.type,
    tag: SEMANTIC_COLOR_TOKENS.light.syntax.tag,
    attribute: SEMANTIC_COLOR_TOKENS.light.syntax.attribute,
    operator: SEMANTIC_COLOR_TOKENS.light.syntax.operator,
    delimiter: SEMANTIC_COLOR_TOKENS.light.syntax.delimiter,
    variable: SEMANTIC_COLOR_TOKENS.light.syntax.variable,
  },
  dark: {
    background: SEMANTIC_COLOR_TOKENS.dark.background.editor,
    foreground: SEMANTIC_COLOR_TOKENS.dark.editor.foreground,
    lineHighlight: SEMANTIC_COLOR_TOKENS.dark.editor.lineHighlight,
    selection: SEMANTIC_COLOR_TOKENS.dark.editor.selection,
    lineNumber: SEMANTIC_COLOR_TOKENS.dark.editor.lineNumber,
    gutter: SEMANTIC_COLOR_TOKENS.dark.editor.gutter,
    cursor: SEMANTIC_COLOR_TOKENS.dark.editor.cursor,
    comment: SEMANTIC_COLOR_TOKENS.dark.syntax.comment,
    keyword: SEMANTIC_COLOR_TOKENS.dark.syntax.keyword,
    string: SEMANTIC_COLOR_TOKENS.dark.syntax.string,
    number: SEMANTIC_COLOR_TOKENS.dark.syntax.number,
    constant: SEMANTIC_COLOR_TOKENS.dark.syntax.constant,
    function: SEMANTIC_COLOR_TOKENS.dark.syntax.function,
    type: SEMANTIC_COLOR_TOKENS.dark.syntax.type,
    tag: SEMANTIC_COLOR_TOKENS.dark.syntax.tag,
    attribute: SEMANTIC_COLOR_TOKENS.dark.syntax.attribute,
    operator: SEMANTIC_COLOR_TOKENS.dark.syntax.operator,
    delimiter: SEMANTIC_COLOR_TOKENS.dark.syntax.delimiter,
    variable: SEMANTIC_COLOR_TOKENS.dark.syntax.variable,
  },
};

// ---------------------------------------------------------------------------
// Community families — official palettes with full 19-key coverage
// ---------------------------------------------------------------------------

const oneDarkPalettes = {
  light: {
    background: "#fafafa",
    foreground: "#383a42",
    lineHighlight: "#f0f0f1",
    selection: "#e5e5e6",
    lineNumber: "#9d9d9f",
    gutter: "#fafafa",
    cursor: "#526eff",
    comment: "#a0a1a7",
    keyword: "#a626a4",
    string: "#50a14f",
    number: "#986801",
    constant: "#986801",
    function: "#4078f2",
    type: "#c18401",
    tag: "#e45649",
    attribute: "#986801",
    operator: "#0184bc",
    delimiter: "#383a42",
    variable: "#e45649",
  },
  dark: {
    background: "#282c34",
    foreground: "#abb2bf",
    lineHighlight: "#2c313a",
    selection: "#3e4451",
    lineNumber: "#4b5263",
    gutter: "#282c34",
    cursor: "#528bff",
    comment: "#5c6370",
    keyword: "#c678dd",
    string: "#98c379",
    number: "#d19a66",
    constant: "#d19a66",
    function: "#61afef",
    type: "#e5c07b",
    tag: "#e06c75",
    attribute: "#d19a66",
    operator: "#56b6c2",
    delimiter: "#abb2bf",
    variable: "#e06c75",
  },
};

const draculaPalettes = {
  light: {
    background: "#f8f8f2",
    foreground: "#44475a",
    lineHighlight: "#e9e9f0",
    selection: "#e5e5ee",
    lineNumber: "#6272a4",
    gutter: "#f8f8f2",
    cursor: "#44475a",
    comment: "#6272a4",
    keyword: "#ff79c6",
    string: "#50fa7b",
    number: "#bd93f9",
    constant: "#bd93f9",
    function: "#50fa7b",
    type: "#8be9fd",
    tag: "#ff79c6",
    attribute: "#50fa7b",
    operator: "#ff79c6",
    delimiter: "#44475a",
    variable: "#44475a",
  },
  dark: {
    background: "#282a36",
    foreground: "#f8f8f2",
    lineHighlight: "#3d3f4e",
    selection: "#44475a",
    lineNumber: "#6272a4",
    gutter: "#282a36",
    cursor: "#f8f8f2",
    comment: "#6272a4",
    keyword: "#ff79c6",
    string: "#f1fa8c",
    number: "#bd93f9",
    constant: "#bd93f9",
    function: "#50fa7b",
    type: "#8be9fd",
    tag: "#ff79c6",
    attribute: "#50fa7b",
    operator: "#ff79c6",
    delimiter: "#f8f8f2",
    variable: "#f8f8f2",
  },
};

const githubPalettes = {
  light: {
    background: "#ffffff",
    foreground: "#24292f",
    lineHighlight: "#f6f8fa",
    selection: "#d0d7de",
    lineNumber: "#8c959f",
    gutter: "#f6f8fa",
    cursor: "#0969da",
    comment: "#6e7781",
    keyword: "#cf222e",
    string: "#0a3069",
    number: "#0550ae",
    constant: "#0550ae",
    function: "#8250df",
    type: "#953800",
    tag: "#116329",
    attribute: "#0550ae",
    operator: "#0550ae",
    delimiter: "#24292f",
    variable: "#953800",
  },
  dark: {
    background: "#0d1117",
    foreground: "#c9d1d9",
    lineHighlight: "#161b22",
    selection: "#264f78",
    lineNumber: "#8b949e",
    gutter: "#0d1117",
    cursor: "#c9d1d9",
    comment: "#8b949e",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    number: "#79c0ff",
    constant: "#79c0ff",
    function: "#d2a8ff",
    type: "#ffa657",
    tag: "#7ee787",
    attribute: "#79c0ff",
    operator: "#79c0ff",
    delimiter: "#c9d1d9",
    variable: "#ffa657",
  },
};

const tokyoNightPalettes = {
  light: {
    background: "#d5d6db",
    foreground: "#3760bf",
    lineHighlight: "#e6e7ec",
    selection: "#b7c1e3",
    lineNumber: "#848cb5",
    gutter: "#d5d6db",
    cursor: "#3760bf",
    comment: "#848cb5",
    keyword: "#8c4351",
    string: "#485e30",
    number: "#965027",
    constant: "#965027",
    function: "#34548d",
    type: "#8f5e15",
    tag: "#8c4351",
    attribute: "#965027",
    operator: "#965027",
    delimiter: "#3760bf",
    variable: "#343b58",
  },
  dark: {
    background: "#1a1b26",
    foreground: "#a9b1d6",
    lineHighlight: "#24283b",
    selection: "#28344a",
    lineNumber: "#565f89",
    gutter: "#1a1b26",
    cursor: "#c0caf5",
    comment: "#565f89",
    keyword: "#bb9af7",
    string: "#9ece6a",
    number: "#ff9e64",
    constant: "#ff9e64",
    function: "#7aa2f7",
    type: "#2ac3de",
    tag: "#f7768e",
    attribute: "#bb9af7",
    operator: "#89ddff",
    delimiter: "#a9b1d6",
    variable: "#c0caf5",
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const CODE_THEME_FAMILIES: CodeThemeFamily[] = [
  { id: "yishan", label: "Yishan", palettes: yishanPalettes },
  { id: "one-dark", label: "One Dark", palettes: oneDarkPalettes },
  { id: "dracula", label: "Dracula", palettes: draculaPalettes },
  { id: "github", label: "GitHub", palettes: githubPalettes },
  { id: "tokyo-night", label: "Tokyo Night", palettes: tokyoNightPalettes },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCodeThemeFamily(id: CodeThemeFamilyId): CodeThemeFamily {
  const family = CODE_THEME_FAMILIES.find((f) => f.id === id);
  if (!family) {
    throw new Error(`Unknown code theme family: ${id}`);
  }
  return family;
}

export function resolveCodeTheme(familyId: CodeThemeFamilyId, mode: "light" | "dark"): CodeThemePalette {
  return getCodeThemeFamily(familyId).palettes[mode];
}

export function getMonacoThemeName(familyId: CodeThemeFamilyId, mode: "light" | "dark"): string {
  return `${familyId}-${mode}`;
}

export function isDarkMode(mode: "light" | "dark"): boolean {
  return mode === "dark";
}
