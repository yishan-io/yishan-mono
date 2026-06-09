import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution";
import { EDITOR_COLORS } from "./diffTheme";

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
    if (label === "typescript" || label === "typescriptreact" || label === "javascript" || label === "javascriptreact") {
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
    "graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram",
    "stateDiagram-v2", "erDiagram", "gantt", "pie", "gitGraph", "journey",
    "quadrantChart", "requirementDiagram", "mindmap", "timeline", "sankey-beta",
    "xychart-beta", "block-beta",
    "subgraph", "end",
    "participant", "actor", "activate", "deactivate", "loop", "alt", "else",
    "opt", "par", "critical", "break", "rect", "note", "over",
    "class", "section", "title", "dateFormat", "axisFormat", "excludes",
    "state", "direction",
    "LR", "RL", "TB", "BT", "TD",
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
      [/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|requirementDiagram|mindmap|timeline|sankey-beta|xychart-beta|block-beta)\b/, "type"],

      // Keywords
      [/\b(subgraph|end|participant|actor|activate|deactivate|loop|alt|else|opt|par|critical|break|rect|note|over|class|section|title|dateFormat|axisFormat|excludes|state|direction|LR|RL|TB|BT|TD)\b/, "keyword"],

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
 * Registers the yishan-light and yishan-dark Monaco themes (idempotent).
 * Must be called before creating any editor instance.
 */
export function ensureEditorThemes() {
  if (themesRegistered) return;
  themesRegistered = true;

  monaco.editor.defineTheme(YISHAN_THEME_LIGHT, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7a8190", fontStyle: "italic" },
      { token: "keyword", foreground: "8a3ffc" },
      { token: "string", foreground: "2d7a00" },
      { token: "number", foreground: "bd5500" },
      { token: "type", foreground: "006b99" },
      { token: "function", foreground: "0060b8" },
      { token: "variable", foreground: "1f2430" },
      { token: "constant", foreground: "9a6100" },
      { token: "operator", foreground: "3f4758" },
      { token: "delimiter", foreground: "3f4758" },
      { token: "tag", foreground: "b04900" },
      { token: "attribute.name", foreground: "0b6ea8" },
      { token: "attribute.value", foreground: "2d7a00" },
    ],
    colors: {
      "editor.background": EDITOR_COLORS.light.background,
      "editor.foreground": EDITOR_COLORS.light.foreground,
      "editor.lineHighlightBackground": EDITOR_COLORS.light.lineHighlight,
      "editor.selectionBackground": EDITOR_COLORS.light.selection,
      "editorLineNumber.foreground": EDITOR_COLORS.light.lineNumber,
      "editorGutter.background": EDITOR_COLORS.light.gutter,
      "editorCursor.foreground": EDITOR_COLORS.light.cursor,
    },
  });

  monaco.editor.defineTheme(YISHAN_THEME_DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7f8796", fontStyle: "italic" },
      { token: "keyword", foreground: "c49fff" },
      { token: "string", foreground: "a7d56d" },
      { token: "number", foreground: "ffa86f" },
      { token: "type", foreground: "8ad9ff" },
      { token: "function", foreground: "79c4ff" },
      { token: "variable", foreground: "d4dbe8" },
      { token: "constant", foreground: "ffd57a" },
      { token: "operator", foreground: "c0c8d8" },
      { token: "delimiter", foreground: "c0c8d8" },
      { token: "tag", foreground: "ffb86b" },
      { token: "attribute.name", foreground: "86d0ff" },
      { token: "attribute.value", foreground: "a7d56d" },
    ],
    colors: {
      "editor.background": EDITOR_COLORS.dark.background,
      "editor.foreground": EDITOR_COLORS.dark.foreground,
      "editor.lineHighlightBackground": EDITOR_COLORS.dark.lineHighlight,
      "editor.selectionBackground": EDITOR_COLORS.dark.selection,
      "editorLineNumber.foreground": EDITOR_COLORS.dark.lineNumber,
      "editorGutter.background": EDITOR_COLORS.dark.gutter,
      "editorCursor.foreground": EDITOR_COLORS.dark.cursor,
    },
  });
}

/** The locally bundled Monaco editor namespace. */
export { monaco };
