/**
 * Shell path escaping utilities for safely inserting file paths into terminal input.
 *
 * These functions produce shell-safe representations of arbitrary file system paths,
 * handling special characters, spaces, and shell metacharacters.
 */

/**
 * Characters that are safe in a bare (unquoted) shell path segment.
 * Anything outside this set triggers quoting.
 */
const SHELL_SAFE_CHARS = /^[a-zA-Z0-9_\-./~:@]+$/;

/**
 * Escapes one file path for safe insertion into a POSIX shell command line.
 *
 * Strategy:
 * - If the path contains only safe characters, return it unmodified.
 * - Otherwise, wrap it in single quotes and escape any embedded single quotes
 *   using the standard `'\''` idiom (end quote, escaped quote, start quote).
 */
export function escapePathForShell(path: string): string {
  if (!path) {
    return "''";
  }

  if (SHELL_SAFE_CHARS.test(path)) {
    return path;
  }

  // Single-quote the path, escaping any internal single quotes.
  const escaped = path.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * Formats multiple paths for shell insertion, space-separated.
 * Each path is independently escaped.
 */
export function escapePathsForShell(paths: string[]): string {
  return paths.map(escapePathForShell).join(" ");
}
