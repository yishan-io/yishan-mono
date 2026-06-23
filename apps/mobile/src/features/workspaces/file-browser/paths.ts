const ROOT_PATH = "";

/**
 * Normalizes a potentially empty or platform-specific path into the mobile browser format.
 */
export function normalizePath(path: string | null | undefined): string {
  if (typeof path !== "string") {
    return ROOT_PATH;
  }

  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "." || trimmed === "/") {
    return ROOT_PATH;
  }

  return trimmed
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

/**
 * Returns whether the given path points at the logical root.
 */
export function isRootPath(path: string | null | undefined): boolean {
  return normalizePath(path) === ROOT_PATH;
}

/**
 * Returns the normalized parent directory path for a file or directory.
 */
export function getParentPath(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return ROOT_PATH;
  }

  const segments = normalized.split("/");
  segments.pop();
  return segments.join("/");
}

/**
 * Returns the base name for a normalized path.
 */
export function getBaseName(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? "";
}

/**
 * Joins a parent path and child name into one normalized path.
 */
export function joinPath(parentPath: string | null | undefined, childName: string): string {
  const normalizedParent = normalizePath(parentPath);
  const normalizedChild = normalizePath(childName);

  if (!normalizedParent) {
    return normalizedChild;
  }

  if (!normalizedChild) {
    return normalizedParent;
  }

  return `${normalizedParent}/${normalizedChild}`;
}

/**
 * Builds breadcrumb-like path segments for a normalized path.
 */
export function buildPathSegments(path: string | null | undefined): Array<{ label: string; path: string }> {
  const normalized = normalizePath(path);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/");
  return segments.map((label, index) => ({
    label,
    path: segments.slice(0, index + 1).join("/"),
  }));
}

/**
 * Builds the list of ancestor paths that should be expanded to reveal a path.
 */
export function buildAncestorPaths(path: string | null | undefined): string[] {
  const normalized = normalizePath(path);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}
