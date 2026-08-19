/**
 * Domain-free path helpers (desktop6-adjust.md W1).
 *
 * `getFileName` moved here from `features/workbench/model/tabs.ts` so that
 * Workspace Model and State can use it without importing Workbench. It is a
 * pure string utility with no product behavior.
 */

/** Extracts the final path segment as a display file name. */
export function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}
