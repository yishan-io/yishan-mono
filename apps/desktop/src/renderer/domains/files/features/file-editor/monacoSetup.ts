import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import "./monacoFindWidget.css";
import { CODE_THEME_FAMILIES, getMonacoThemeName } from "@renderer/ui/codeThemes";
import { buildMonacoThemeRules } from "./monacoThemeRules";

// Configure Monaco to use locally bundled workers instead of loading from CDN.
// The `new Worker(new URL(..., import.meta.url))` pattern is a web standard that
// Vite detects and bundles as separate chunks at build time.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") {
      return new Worker(new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url), {
        type: "module",
      });
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), {
        type: "module",
      });
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new Worker(new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url), {
        type: "module",
      });
    }
    if (
      label === "typescript" ||
      label === "typescriptreact" ||
      label === "javascript" ||
      label === "javascriptreact"
    ) {
      return new Worker(new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url), {
        type: "module",
      });
    }
    return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), {
      type: "module",
    });
  },
};

// Configure TypeScript/JavaScript defaults to suppress errors for unresolved
// imports. Monaco runs in isolation without access to the user's filesystem,
// so it cannot resolve relative imports from the project being edited.
const tsDefaults = monaco.languages.typescript.typescriptDefaults;
const jsDefaults = monaco.languages.typescript.javascriptDefaults;

const sharedCompilerOptions: monaco.languages.typescript.CompilerOptions = {
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  allowJs: true,
  allowNonTsExtensions: true,
  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  noEmit: true,
  // Suppress diagnostics for modules that cannot be found.
  noResolve: true,
};

tsDefaults.setCompilerOptions(sharedCompilerOptions);
jsDefaults.setCompilerOptions(sharedCompilerOptions);

// Disable semantic validation (type errors for unresolved modules) but
// keep syntax validation so obvious typos are still flagged.
tsDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
jsDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

// -- Mermaid language registration -----------------------------------------
// Registers a Monarch tokenizer for Mermaid diagram syntax. Since Monaco's
// built-in Markdown tokenizer uses `nextEmbedded: "$1"` for fenced code blocks,
// having a registered "mermaid" language means ```mermaid blocks automatically
// receive syntax highlighting in Markdown files.

monaco.languages.register({ id: "mermaid" });
monaco.languages.setMonarchTokensProvider("mermaid", {
  defaultToken: "",
  tokenPostfix: ".mermaid",

  keywords: [
    "graph",
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "gantt",
    "pie",
    "gitGraph",
    "journey",
    "quadrantChart",
    "requirementDiagram",
    "mindmap",
    "timeline",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "subgraph",
    "end",
    "participant",
    "actor",
    "activate",
    "deactivate",
    "loop",
    "alt",
    "else",
    "opt",
    "par",
    "critical",
    "break",
    "rect",
    "note",
    "over",
    "class",
    "section",
    "title",
    "dateFormat",
    "axisFormat",
    "excludes",
    "state",
    "direction",
    "LR",
    "RL",
    "TB",
    "BT",
    "TD",
  ],

  operators: ["-->", "---", "-.->", "==>", "--", "-..-", "==", "-->|", "|", ":::", "->", "<->"],

  tokenizer: {
    root: [
      // Comments
      [/%%.*$/, "comment"],

      // Strings
      [/"[^"]*"/, "string"],
      [/'[^']*'/, "string"],

      // Diagram type declarations (first keyword on a line)
      [
        /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|requirementDiagram|mindmap|timeline|sankey-beta|xychart-beta|block-beta)\b/,
        "type",
      ],

      // Keywords
      [
        /\b(subgraph|end|participant|actor|activate|deactivate|loop|alt|else|opt|par|critical|break|rect|note|over|class|section|title|dateFormat|axisFormat|excludes|state|direction|LR|RL|TB|BT|TD)\b/,
        "keyword",
      ],

      // Arrow operators and connections
      [/-->\|[^|]*\|/, "operator"],
      [/--?>/, "operator"],
      [/==>/, "operator"],
      [/-\.->/, "operator"],
      [/~~>/, "operator"],
      [/<-->/, "operator"],
      [/---/, "operator"],
      [/===/, "operator"],

      // Node shapes: brackets, parens, braces, etc.
      [/[[\](){}|<>]/, "delimiter"],

      // Labels on edges (text after |)
      [/\|[^|]*\|/, "string"],

      // Class/style definitions
      [/:::\s*\w+/, "attribute.name"],

      // Numbers
      [/\b\d+\b/, "number"],

      // Identifiers (node names)
      [/[a-zA-Z_]\w*/, "variable"],

      // Whitespace
      [/\s+/, "white"],
    ],
  },
});

// -- Custom editor themes (shared by FileEditor and FileDiffViewer) --------

export const YISHAN_THEME_LIGHT = "yishan-light";
export const YISHAN_THEME_DARK = "yishan-dark";

let themesRegistered = false;

/**
 * Registers one Monaco theme per (code-theme-family, app-mode) pair (idempotent).
 * Must be called before creating any editor instance.
 */
export function ensureEditorThemes() {
  if (themesRegistered) return;
  themesRegistered = true;

  for (const family of CODE_THEME_FAMILIES) {
    for (const mode of ["light", "dark"] as const) {
      const palette = family.palettes[mode];
      const themeName = getMonacoThemeName(family.id, mode);

      monaco.editor.defineTheme(themeName, {
        base: mode === "dark" ? "vs-dark" : "vs",
        inherit: true,
        rules: buildMonacoThemeRules(palette),
        colors: {
          "editor.background": palette.background,
          "editor.foreground": palette.foreground,
          "editor.lineHighlightBackground": palette.lineHighlight,
          "editor.selectionBackground": palette.selection,
          "editorLineNumber.foreground": palette.lineNumber,
          "editorGutter.background": palette.gutter,
          "editorCursor.foreground": palette.cursor,
        },
      });
    }
  }
}

/** The locally bundled Monaco editor namespace. */
export { monaco };
