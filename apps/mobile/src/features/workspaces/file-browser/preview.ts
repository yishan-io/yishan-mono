import { getBaseName } from "./paths";
import type { FileBrowserEntry, FilePreviewKind } from "./types";

const MARKDOWN_EXTENSIONS = new Set(["markdown", "md", "mdown", "mdx"]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const CODE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cpp",
  "css",
  "go",
  "h",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "kts",
  "m",
  "mm",
  "php",
  "plist",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);
const UNSUPPORTED_EXTENSIONS = new Set([
  "7z",
  "bin",
  "db",
  "dmg",
  "exe",
  "gz",
  "ico",
  "lockb",
  "mov",
  "mp3",
  "mp4",
  "pdf",
  "sqlite",
  "tar",
  "ttf",
  "wav",
  "webm",
  "woff",
  "woff2",
  "zip",
]);

function getExtension(path: string): string {
  const baseName = getBaseName(path);
  const lastDotIndex = baseName.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === baseName.length - 1) {
    return "";
  }

  return baseName.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Chooses the preview renderer kind for a workspace file path.
 */
export function detectFilePreviewKind(path: string): FilePreviewKind {
  const extension = getExtension(path);
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return "unsupported";
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }
  return "text";
}

/**
 * Sorts file browser entries with directories first and natural case-insensitive ordering.
 */
export function sortFileBrowserEntries(entries: readonly FileBrowserEntry[]): FileBrowserEntry[] {
  return [...entries].sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

/**
 * Splits preview content into display lines using normalized newlines.
 */
export function splitPreviewLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  return normalized.split("\n");
}

/**
 * Formats a byte size for compact mobile display.
 */
export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
