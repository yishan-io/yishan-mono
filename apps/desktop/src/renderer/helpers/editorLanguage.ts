/**
 * Maps file extensions to Monaco Editor language identifiers.
 *
 * Monaco ships with built-in tokenizers for all languages listed here, so no
 * extra language packs need to be imported.
 */
const LANGUAGE_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",

  // HTML
  html: "html",
  htm: "html",

  // CSS
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",

  // Data / Config
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  svg: "xml",

  // Markdown
  md: "markdown",
  mdx: "markdown",

  // Python
  py: "python",
  pyi: "python",
  pyw: "python",

  // Rust
  rs: "rust",

  // Go
  go: "go",

  // Java
  java: "java",

  // C / C++
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",

  // SQL
  sql: "sql",

  // PHP
  php: "php",

  // WebAssembly Text
  wat: "wasm",
  wast: "wasm",

  // Vue (Monaco doesn't have a built-in Vue mode; fall back to HTML)
  vue: "html",

  // Angular (fall back to HTML)
  ng: "html",

  // Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",

  // Ruby
  rb: "ruby",

  // Swift
  swift: "swift",

  // Kotlin
  kt: "kotlin",
  kts: "kotlin",

  // Dockerfile
  dockerfile: "dockerfile",

  // GraphQL
  graphql: "graphql",
  gql: "graphql",

  // Mermaid
  mmd: "mermaid",
  mermaid: "mermaid",
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
 * Returns the Monaco language identifier for the given file path,
 * or `null` when no language mapping is available (graceful fallback).
 */
export function getLanguageId(path: string): string | null {
  const ext = getFileExtension(path);
  return LANGUAGE_MAP[ext] ?? null;
}

/** Returns true when the registry has support for the given file path's extension. */
export function isLanguageSupported(path: string): boolean {
  return getFileExtension(path) in LANGUAGE_MAP;
}

/** Returns the list of supported file extensions. Mainly useful for tests. */
export function getSupportedExtensions(): string[] {
  return Object.keys(LANGUAGE_MAP);
}

/** Set of file extensions recognized as Markdown formats. */
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);

/** Returns true when the given file path refers to a Markdown file. */
export function isMarkdownFile(path: string): boolean {
  const ext = getFileExtension(path);
  return MARKDOWN_EXTENSIONS.has(ext);
}

/** Set of file extensions recognized as previewable image formats. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "avif"]);

/** Returns true when the given file path refers to a previewable image format. */
export function isImageFile(path: string): boolean {
  const ext = getFileExtension(path);
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Set of file extensions that should open in an unsupported file view.
 *
 * We keep this as a broad binary/non-text extension list so common large/binary
 * assets do not open as broken text tabs.
 */
const UNSUPPORTED_FILE_TAB_EXTENSIONS = new Set([
  // Databases
  "sqlite",
  "sqlite3",
  "db",
  "mdb",
  "accdb",
  "parquet",
  "feather",
  "orc",

  // Archives / packages
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "iso",
  "dmg",

  // Documents / binaries
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",

  // Compiled / executable
  "exe",
  "dll",
  "so",
  "dylib",
  "o",
  "obj",
  "a",
  "lib",
  "class",
  "jar",
  "war",
  "ear",
  "wasm",

  // Media (non-image)
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
]);

/** Returns true when the given file path should open in the unsupported file view. */
export function isUnsupportedFileTab(path: string): boolean {
  const ext = getFileExtension(path);
  return UNSUPPORTED_FILE_TAB_EXTENSIONS.has(ext);
}
