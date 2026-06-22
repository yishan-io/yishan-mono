const ROOT_PATH = "";

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

export function isRootPath(path: string | null | undefined): boolean {
  return normalizePath(path) === ROOT_PATH;
}

export function getParentPath(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return ROOT_PATH;
  }

  const segments = normalized.split("/");
  segments.pop();
  return segments.join("/");
}

export function getBaseName(path: string | null | undefined): string {
  const normalized = normalizePath(path);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? "";
}

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

export function buildAncestorPaths(path: string | null | undefined): string[] {
  const normalized = normalizePath(path);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}
