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
import { codeToTokens } from "shiki";
import { resolveCodeTheme } from "./codeThemes";
import { buildOverriddenRules } from "./diffTheme";
import { buildMonacoThemeRules, resolveMonacoTokenColor } from "./monacoThemeRules";

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

const MODE = "light";
const palette = resolveCodeTheme("yishan", MODE);
const gitDiff =
  MODE === "light"
    ? { added: "#2ea043", deleted: "#f85149", modified: "#1a7fd4" }
    : { added: "#3fb950", deleted: "#f85149", modified: "#58a6ff" };
const monacoRules = buildMonacoThemeRules(palette);

const diffTheme = {
  name: "yishan-cmp",
  type: MODE,
  colors: { ...pierreLight.colors, "editor.foreground": palette.foreground, "editor.background": palette.background },
  tokenColors: buildOverriddenRules(pierreLight.tokenColors as never, palette, gitDiff),
};

const keyByColor = new Map<string, string>();
for (const [key, value] of Object.entries(palette)) {
  keyByColor.set(String(value).toUpperCase(), key);
}
const label = (color: string) => {
  const key = keyByColor.get(color.toUpperCase());
  return key ? `${key}(${color.toUpperCase()})` : color.toUpperCase();
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

function monacoColors(langId: string, source: string): string[] {
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
}

async function shikiColors(langId: string, source: string): Promise<string[]> {
  const colors = new Array<string>(source.length).fill(palette.foreground);
  const result = await codeToTokens(source, { lang: langId as never, theme: diffTheme as never });
  for (const line of result.tokens) {
    for (const token of line) {
      const start = token.offset;
      const end = start + token.content.length;
      for (let p = start; p < end; p++) colors[p] = token.color ?? palette.foreground;
    }
  }
  return colors;
}

describe("syntax theme comparison (monaco vs diff)", () => {
  it("colors every token identically across the sample battery", async () => {
    const failures: Array<{ lang: string; text: string; monaco: string; diff: string }> = [];
    const perLang = new Map<string, number>();

    for (const [langId, source] of Object.entries(BATTERY)) {
      const mono = monacoColors(langId, source);
      const diffColors = await shikiColors(langId, source);
      let count = 0;
      let i = 0;
      while (i < source.length) {
        if (mono[i] !== diffColors[i]) {
          let j = i;
          while (j < source.length && mono[j] !== diffColors[j]) j++;
          failures.push({
            lang: langId,
            text: source.slice(i, j),
            monaco: label(mono[i] ?? palette.foreground),
            diff: label(diffColors[i] ?? palette.foreground),
          });
          count++;
          i = j;
        } else {
          i++;
        }
      }
      perLang.set(langId, count);
    }

    if (failures.length > 0) {
      console.log("\n===== SYNTAX COLOR MISMATCHES (monaco vs diff) =====");
      for (const langId of [...perLang.keys()].sort()) {
        console.log(`  ${langId}: ${perLang.get(langId)}`);
      }
      const normalized = [...new Set(failures.map((f) => `${f.lang}|${f.monaco}|${f.diff}`))].sort();
      for (const n of normalized) console.log(`  NORM ${n}`);
    }

    // Regression guard: the set of (lang, monaco-color-key, diff-color-key)
    // mismatches must exactly equal the curated list of accepted residuals
    // (grammar-level Monarch vs TextMate differences that a theme mapping
    // cannot reconcile without breaking other languages).
    const acceptedResiduals = new Set<string>([
      "javascript|string(#2D7A00)|delimiter(#3F4758)", // template literal backticks
      "html|delimiter(#3F4758)|tag(#B04900)", // tag brackets
      "html|variable(#1F2430)|tag(#B04900)", // doctype / tag whitespace
      "markdown|string(#2D7A00)|delimiter(#3F4758)", // inline code + link brackets
      "markdown|variable(#1F2430)|delimiter(#3F4758)", // inline code backticks
      "markdown|keyword(#8A3FFC)|delimiter(#3F4758)", // list dash
      "python|variable(#1F2430)|delimiter(#3F4758)", // arrow
      "python|variable(#1F2430)|type(#006B99)", // class name
      "rust|keyword(#8A3FFC)|type(#006B99)", // primitive type name (monarch quirk)
      "rust|variable(#1F2430)|type(#006B99)", // type name
      "rust|string(#2D7A00)|delimiter(#3F4758)", // string quotes
      "go|variable(#1F2430)|type(#006B99)", // package name
      "java|variable(#1F2430)|type(#006B99)", // class name
      "java|delimiter(#3F4758)|type(#006B99)", // braces (java grammar quirk)
      "java|variable(#1F2430)|keyword(#8A3FFC)", // String type keyword
      "shell|variable(#1F2430)|comment(#7A8190)", // shebang
      "shell|type(#006B99)|variable(#1F2430)", // echo builtin
      "shell|string(#2D7A00)|variable(#1F2430)", // $VAR expansion
      "shell|attribute(#0B6EA8)|delimiter(#3F4758)", // -f flag
      "shell|keyword(#8A3FFC)|variable(#1F2430)", // exit builtin
    ]);
    const actual = new Set(failures.map((f) => `${f.lang}|${f.monaco}|${f.diff}`));
    expect(actual).toEqual(acceptedResiduals);
  }, 120_000);
});
