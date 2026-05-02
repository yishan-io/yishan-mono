import { angular } from "@codemirror/lang-angular";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { less } from "@codemirror/lang-less";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sass } from "@codemirror/lang-sass";
import { sql } from "@codemirror/lang-sql";
import { vue } from "@codemirror/lang-vue";
import { wast } from "@codemirror/lang-wast";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import type { Extension } from "@codemirror/state";

type LanguageFactory = () => Extension;

/**
 * Maps file extensions to CodeMirror language support factories.
 *
 * Each factory is called once per editor instance to produce a fresh
 * extension. Factories (rather than pre-built instances) are used because
 * some language packs accept configuration options (e.g. jsx, typescript).
 */
const LANGUAGE_FACTORIES: Record<string, LanguageFactory> = {
  // JavaScript / TypeScript
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  mjs: () => javascript(),
  mts: () => javascript({ typescript: true }),
  cjs: () => javascript(),
  cts: () => javascript({ typescript: true }),

  // HTML
  html: () => html(),
  htm: () => html(),

  // CSS
  css: () => css(),
  scss: () => sass({ indented: false }),
  sass: () => sass({ indented: true }),
  less: () => less(),

  // Data / Config
  json: () => json(),
  yaml: () => yaml(),
  yml: () => yaml(),
  xml: () => xml(),
  svg: () => xml(),

  // Markdown
  md: () => markdown(),
  mdx: () => markdown(),

  // Python
  py: () => python(),
  pyi: () => python(),
  pyw: () => python(),

  // Rust
  rs: () => rust(),

  // Go
  go: () => go(),

  // Java
  java: () => java(),

  // C / C++
  c: () => cpp(),
  h: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  cxx: () => cpp(),
  hpp: () => cpp(),
  hxx: () => cpp(),

  // SQL
  sql: () => sql(),

  // PHP
  php: () => php(),

  // WebAssembly Text
  wat: () => wast(),
  wast: () => wast(),

  // Vue
  vue: () => vue(),

  // Angular
  ng: () => angular(),
};

/**
 * Extracts the file extension (lowercase, without dot) from a path.
 * Handles both forward-slash (Unix) and backslash (Windows) separators.
 * Returns an empty string when no extension is found.
 */
export function getFileExtension(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const filename = separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return filename.slice(dotIndex + 1).toLowerCase();
}

/**
 * Returns the CodeMirror language extension for the given file path,
 * or `null` when no language pack is available (graceful fallback).
 */
export function getLanguageExtension(path: string): Extension | null {
  const ext = getFileExtension(path);
  const factory = LANGUAGE_FACTORIES[ext];
  return factory ? factory() : null;
}

/** Returns true when the registry has support for the given file path's extension. */
export function isLanguageSupported(path: string): boolean {
  return getFileExtension(path) in LANGUAGE_FACTORIES;
}

/** Returns the list of supported file extensions. Mainly useful for tests. */
export function getSupportedExtensions(): string[] {
  return Object.keys(LANGUAGE_FACTORIES);
}
