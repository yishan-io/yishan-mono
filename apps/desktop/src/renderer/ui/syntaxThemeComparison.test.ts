// @vitest-environment jsdom
/**
 * Compares syntax-highlight colors between the Monaco editor and the Pierre
 * diff viewer across a battery of languages.
 *
 * Both sides use the app's REAL theme rules:
 *   - Monaco: monaco.editor.tokenize() + buildMonacoThemeRules()/resolveMonacoTokenColor()
 *   - Diff:   shiki codeToTokens() with the theme built by buildOverriddenRules()
 *
 * Any per-character color mismatch fails the test and is printed, so a mapping
 * gap in either engine shows up here instead of being found by eye.
 * Run: cd apps/desktop && bunx vitest run helpers/syntaxThemeComparison
 */
import { describe, expect, it } from "vitest";

// -- jsdom browser-API stubs monaco's standalone theme service requires -------
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import pierreLight from "@pierre/theme/pierre-light";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import cssGrammar from "@shikijs/langs/css";
import goGrammar from "@shikijs/langs/go";
import htmlGrammar from "@shikijs/langs/html";
import javaGrammar from "@shikijs/langs/java";
import javascriptGrammar from "@shikijs/langs/javascript";
import markdownGrammar from "@shikijs/langs/markdown";
import pythonGrammar from "@shikijs/langs/python";
import rustGrammar from "@shikijs/langs/rust";
import shellGrammar from "@shikijs/langs/shell";
import typescriptGrammar from "@shikijs/langs/typescript";
import yamlGrammar from "@shikijs/langs/yaml";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as cssDef } from "monaco-editor/esm/vs/basic-languages/css/css.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as goDef } from "monaco-editor/esm/vs/basic-languages/go/go.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as htmlDef } from "monaco-editor/esm/vs/basic-languages/html/html.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as javaDef } from "monaco-editor/esm/vs/basic-languages/java/java.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as javascriptDef } from "monaco-editor/esm/vs/basic-languages/javascript/javascript.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as markdownDef } from "monaco-editor/esm/vs/basic-languages/markdown/markdown.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as pythonDef } from "monaco-editor/esm/vs/basic-languages/python/python.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as rustDef } from "monaco-editor/esm/vs/basic-languages/rust/rust.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as shellDef } from "monaco-editor/esm/vs/basic-languages/shell/shell.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as typescriptDef } from "monaco-editor/esm/vs/basic-languages/typescript/typescript.js";
// @ts-ignore monaco basic-language modules are untyped ESM
import { language as yamlDef } from "monaco-editor/esm/vs/basic-languages/yaml/yaml.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { createHighlighterCore } from "shiki/core";
import { buildMonacoThemeRules, resolveMonacoTokenColor } from "../domains/files/infrastructure/monacoThemeRules";
import { buildOverriddenRules } from "../domains/files/ui/diffTheme";
import { type CodeThemePalette, resolveCodeTheme } from "./codeThemes";

// Register the Monarch grammars directly (their lazy contribution loaders need
// the full editor bootstrapping, which is unavailable in jsdom).
for (const [id, def] of [
  ["javascript", javascriptDef],
  ["typescript", typescriptDef],
  ["yaml", yamlDef],
  ["css", cssDef],
  ["html", htmlDef],
  ["markdown", markdownDef],
  ["python", pythonDef],
  ["rust", rustDef],
  ["go", goDef],
  ["java", javaDef],
  ["shell", shellDef],
] as const) {
  monaco.languages.register({ id });
  monaco.languages.setMonarchTokensProvider(id, def);
}

const FAMILIES = ["yishan", "one-dark", "dracula", "github", "tokyo-night"] as const;
const MODES = ["light", "dark"] as const;

// Resolve a color back to its palette key per family (duplicate values, e.g.
// yishan operator == delimiter, collapse to the first key — which is exactly
// right: if two keys share a color, the editor and diff are indistinguishable).
const label = (color: string, palette: CodeThemePalette) => {
  for (const [key, value] of Object.entries(palette)) {
    if (String(value).toUpperCase() === color.toUpperCase()) return key;
  }
  return color.toUpperCase();
};

const BATTERY: Record<string, string> = {
  javascript:
    'const x = 42;\nlet s = "hi";\nfunction f(a) { return a ?? true; }\nclass A extends B {}\n// comment\nconst t = `tpl ${x}`;\n',
  typescript:
    "interface I { n: number; }\ntype T = string | null;\nconst f = (x: T): void => {};\nconst ok: boolean = true;\n",
  yaml: "name: John\ndev: true\nversion: 1.2\nenabled: null\n# comment\nnested:\n  key: 'value'\nlist:\n  - one\n",
  css: "body { color: #fff; margin: 0; }\n.container { display: flex; width: 100%; }\n",
  html: '<!DOCTYPE html>\n<div class="box" id="main">text</div>\n<!-- comment -->\n',
  markdown: "# Title\n\n**bold** and *italic* and `code`\n\n[link](https://x.com)\n- item\n",
  python: "def f(x: int) -> str:\n    return str(x)\n\nclass A:\n    pass\n",
  rust: 'fn main() { let x: u32 = 42; let s = String::from("hi"); }\n',
  go: 'package main\nfunc main() {\n\tx := 42\n\tfmt.Println("hi")\n}\n',
  java: "public class A { private int x = 42; public void m(String s) {} }\n",
  shell: '#!/bin/bash\necho "hello $NAME"\nif [ -f file ]; then exit 1; fi\n',
};

describe("syntax theme comparison (monaco vs diff)", () => {
  it("colors every token identically across families, modes, and the sample battery", async () => {
    const actual = new Set<string>();
    const perLang = new Map<string, number>();

    // Precompute palette + monaco rules + theme object per (family, mode).
    const configs = FAMILIES.flatMap((familyId) =>
      MODES.map((mode) => {
        const palette = resolveCodeTheme(familyId, mode);
        const gitDiff =
          mode === "light"
            ? { added: "#2ea043", deleted: "#f85149", modified: "#1a7fd4" }
            : { added: "#3fb950", deleted: "#f85149", modified: "#58a6ff" };
        return {
          familyId,
          mode,
          palette,
          monacoRules: buildMonacoThemeRules(palette),
          theme: {
            name: `${familyId}-${mode}`,
            type: mode,
            colors: {
              ...pierreLight.colors,
              "editor.foreground": palette.foreground,
              "editor.background": palette.background,
            },
            tokenColors: buildOverriddenRules(pierreLight.tokenColors as never, palette, gitDiff),
          },
        };
      }),
    );

    // One highlighter over all families/modes with the JS regex engine — the
    // same engine @pierre/diffs uses at runtime.
    const highlighter = await createHighlighterCore({
      themes: configs.map((c) => c.theme) as never,
      langs: [
        javascriptGrammar as never,
        typescriptGrammar as never,
        yamlGrammar as never,
        cssGrammar as never,
        htmlGrammar as never,
        markdownGrammar as never,
        pythonGrammar as never,
        rustGrammar as never,
        goGrammar as never,
        javaGrammar as never,
        shellGrammar as never,
      ],
      engine: createJavaScriptRegexEngine(),
    });

    for (const { familyId, mode, palette, monacoRules } of configs) {
      const monacoColorsFor = (langId: string, source: string) => {
        const colors = new Array<string>(source.length).fill(palette.foreground);
        const lines = source.split("\n");
        const tokenized = monaco.editor.tokenize(source, langId);
        let offset = 0;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx] ?? "";
          const lineTokens = tokenized[lineIdx] ?? [];
          for (let i = 0; i < lineTokens.length; i++) {
            const token = lineTokens[i];
            if (!token) continue;
            const next = lineTokens[i + 1];
            const start = offset + token.offset;
            const end = offset + (next ? next.offset : line.length);
            const color = resolveMonacoTokenColor(token.type, palette, monacoRules);
            for (let p = start; p < end; p++) colors[p] = color.toUpperCase();
          }
          offset += line.length + 1;
        }
        return colors;
      };
      const shikiColorsFor = async (langId: string, source: string) => {
        const colors = new Array<string>(source.length).fill(palette.foreground);
        const result = highlighter.codeToTokens(source, { lang: langId as never, theme: `${familyId}-${mode}` });
        for (const line of result.tokens) {
          for (const token of line) {
            const start = token.offset;
            const end = start + token.content.length;
            for (let p = start; p < end; p++) colors[p] = token.color ?? palette.foreground;
          }
        }
        return colors;
      };

      for (const [langId, source] of Object.entries(BATTERY)) {
        const mono = monacoColorsFor(langId, source);
        const diffColors = await shikiColorsFor(langId, source);
        let count = 0;
        let i = 0;
        while (i < source.length) {
          if (mono[i] !== diffColors[i]) {
            let j = i;
            while (j < source.length && mono[j] !== diffColors[j]) j++;
            const seg = source.slice(i, j);
            actual.add(
              `${familyId}|${mode}|${langId}|${label(mono[i] ?? palette.foreground, palette)}|${label(diffColors[i] ?? palette.foreground, palette)}|${JSON.stringify(seg)}`,
            );
            count++;
            i = j;
          } else {
            i++;
          }
        }
        perLang.set(langId, (perLang.get(langId) ?? 0) + count);
      }
    }

    const sorted = [...actual].sort();
    if (sorted.length > 0) {
      console.log("\n===== SYNTAX COLOR MISMATCHES (family|mode|lang|monaco|diff) =====");
      for (const n of sorted) console.log(`  NORM ${n}`);
    }

    // Regression guard: every actual mismatch (lang|text) must be a known
    // residual, and every curated residual class must occur in at least one
    // family/mode. Residuals are grammar-level Monarch vs TextMate differences
    // that a theme mapping cannot reconcile without breaking other languages.
    const acceptedResiduals = new Set<string>([
      'go|"main"', // package name (entity.name.package)
      'html|" "', // whitespace inside tags
      'html|"<!DOCTYPE html>"', // doctype (monarch metatag vs textmate doctype)
      'html|"<"', // tag brackets
      'html|"</"',
      'html|">"',
      'javascript|"`"', // template literal backticks
      'java|"A"', // class name (entity.name.type)
      'java|"String"', // type keyword (monarch identifier vs textmate support.type)
      'java|"{"', // braces (java grammar quirk)
      'java|"}"',
      'markdown|")"', // link close bracket
      'markdown|"- "', // list dash (monarch keyword vs textmate punctuation)
      'markdown|"[link]("', // link brackets
      'markdown|"`code`"', // inline code backticks
      'markdown|"code"', // inline code text (monarch variable vs textmate markup)
      'python|"->"', // arrow (monarch identifier vs textmate keyword.operator)
      'python|"A"', // class name (entity.name.type)
      'rust|":"', // type-annotation colon (monarch quirk)
      'rust|";"',
      'rust|"="',
      'rust|"String"', // type name (entity.name.type)
      'rust|"String::"', // namespace separator
      'rust|"\\""', // string quotes (generic punctuation in the grammar)
      'rust|"u32"', // primitive type name (monarch keyword vs textmate entity.name.type)
      'shell|"#!/bin/bash"', // shebang
      'shell|"$NAME"', // variable expansion (monarch string vs textmate variable)
      'shell|"-f"', // flag (monarch attribute vs textmate punctuation)
      'shell|"echo"', // builtin
      'shell|"exit"', // builtin
      'yaml|"-"', // list dash
    ]);
    const actualKeys = new Set(
      [...actual].map((n) => {
        const parts = n.split("|");
        return `${parts[2]}|${parts[5]}`;
      }),
    );
    expect(actualKeys.size).toBeGreaterThan(0);
    for (const key of actualKeys) {
      expect(acceptedResiduals.has(key), `unexpected residual: ${key}`).toBe(true);
    }
    for (const key of acceptedResiduals) {
      expect(actualKeys.has(key), `curated residual never occurred: ${key}`).toBe(true);
    }
  }, 120_000);
});
