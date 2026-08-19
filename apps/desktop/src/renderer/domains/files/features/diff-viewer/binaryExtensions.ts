/**
 * Set of file extensions that are considered binary (non-text).
 *
 * Used to detect files that should not be opened in the text diff viewer or
 * code editor and should instead show a "binary file" placeholder.
 */
export const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "svg",
  "webp",
  "tiff",
  "tif",
  "avif",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "flac",
  "aac",
  "webm",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "flv",
  "pdf",
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "dmg",
  "iso",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "exe",
  "dll",
  "so",
  "dylib",
  "class",
  "o",
  "obj",
  "pyc",
  "wasm",
]);

/**
 * Returns true if the file path has a binary extension.
 *
 * @example
 * ```ts
 * isBinaryPath("image.png") // true
 * isBinaryPath("readme.md") // false
 * ```
 */
export function isBinaryPath(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTENSIONS.has(extension);
}
