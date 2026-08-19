import type { WorkspaceFileEntry } from "../../externalApps";
import { mergeWorkspaceEntries } from "./fileTreeMerge";
import { getParentRelativePath, normalizeRelativePath } from "./fileTreePaths";

/**
 * File-tree refresh + eviction rules (desktop8 Phase 33: split from
 * useFileTreeOperations.ts). Pure directory-refresh and entry-eviction
 * logic independent of the hook's React state.
 */

export function getImmediateChildPath(parentPath: string, descendantPath: string): string | null {
  const normalizedParentPath = normalizeRelativePath(parentPath);
  const normalizedDescendantPath = normalizeRelativePath(descendantPath);
  if (!normalizedDescendantPath) {
    return null;
  }

  if (!normalizedParentPath) {
    const firstSegment = normalizedDescendantPath.split("/").filter(Boolean)[0];
    return firstSegment ?? null;
  }

  if (!normalizedDescendantPath.startsWith(`${normalizedParentPath}/`)) {
    return null;
  }

  const remainder = normalizedDescendantPath.slice(normalizedParentPath.length + 1);
  const firstSegment = remainder.split("/").filter(Boolean)[0];
  return firstSegment ? `${normalizedParentPath}/${firstSegment}` : null;
}

export function resolveRefreshDirectoryPaths(
  changedRelativePaths: string[],
  loadedDirectoryPaths: Set<string>,
): string[] {
  if (changedRelativePaths.length === 0) {
    return ["", ...loadedDirectoryPaths].sort((left, right) => left.localeCompare(right));
  }

  const refreshPaths = new Set<string>();
  for (const changedPath of changedRelativePaths) {
    const normalizedChangedPath = normalizeRelativePath(changedPath);
    if (!normalizedChangedPath) {
      refreshPaths.add("");
      continue;
    }

    let candidate = normalizedChangedPath;
    for (;;) {
      if (loadedDirectoryPaths.has(candidate)) {
        refreshPaths.add(candidate);
        break;
      }

      const parentPath = getParentRelativePath(candidate);
      if (!parentPath) {
        refreshPaths.add("");
        break;
      }

      candidate = parentPath;
    }
  }

  return [...refreshPaths].sort((left, right) => left.localeCompare(right));
}

export function shouldEvictChangedEntry(
  directoryPath: string,
  normalizedEntryPath: string,
  normalizedChangedPaths: Set<string> | null,
  incomingImmediateChildPaths: Set<string>,
): boolean {
  if (!normalizedChangedPaths) {
    return true;
  }

  const isChangedPath = [...normalizedChangedPaths].some(
    (changedPath) =>
      changedPath === directoryPath ||
      normalizedEntryPath === changedPath ||
      normalizedEntryPath.startsWith(`${changedPath}/`),
  );

  return isChangedPath && !incomingImmediateChildPaths.has(normalizedEntryPath);
}

export function applyDirectoryRefreshes(
  currentEntries: WorkspaceFileEntry[],
  refreshResults: Array<{ directoryPath: string; files: WorkspaceFileEntry[] }>,
  loadedDirectoryPaths: Set<string>,
  changedRelativePaths?: string[],
): WorkspaceFileEntry[] {
  let nextEntries = currentEntries;

  for (const { directoryPath, files } of refreshResults) {
    const incomingImmediateChildPaths = new Set(
      files.map((entry) => normalizeRelativePath(entry.path)).filter((path) => path.length > 0),
    );
    const removedLoadedDirectories: string[] = [];

    for (const loadedDirectoryPath of [...loadedDirectoryPaths]) {
      const immediateChildPath = getImmediateChildPath(directoryPath, loadedDirectoryPath);
      if (!immediateChildPath || incomingImmediateChildPaths.has(immediateChildPath)) {
        continue;
      }

      loadedDirectoryPaths.delete(loadedDirectoryPath);
      removedLoadedDirectories.push(loadedDirectoryPath);
    }

    // When specific changed paths are known, only remove direct children of
    // this directory that (a) are in the changed-path set AND (b) are not
    // present in the incoming refresh result. Entries that were not changed
    // are left untouched — they will be merged by mergeWorkspaceEntries below.
    const normalizedChangedPaths =
      changedRelativePaths && changedRelativePaths.length > 0
        ? new Set(changedRelativePaths.map((p) => normalizeRelativePath(p)).filter(Boolean))
        : null;

    // Root fetch is always recursive and its result is authoritative for the
    // entire workspace tree — replace unconditionally regardless of whether
    // specific changed paths are known. This ensures deleted files are removed
    // from the tree even when the incremental-eviction filter cannot see them
    // (it only inspects direct children of the refreshed directory).
    if (directoryPath === "") {
      nextEntries = mergeWorkspaceEntries([], files);
      continue;
    }

    nextEntries = nextEntries.filter((entry) => {
      const normalizedEntryPath = normalizeRelativePath(entry.path);
      if (!normalizedEntryPath) {
        return false;
      }

      const isDirectChild = getParentRelativePath(normalizedEntryPath) === directoryPath;
      if (isDirectChild) {
        if (normalizedChangedPaths) {
          return !shouldEvictChangedEntry(
            directoryPath,
            normalizedEntryPath,
            normalizedChangedPaths,
            incomingImmediateChildPaths,
          );
        }
        // Full refresh (no specific changed paths) — replace the directory entirely.
        return false;
      }

      // Also evict descendants whose parent directory was removed from loadedPaths.
      return !removedLoadedDirectories.some(
        (removedPath) => normalizedEntryPath === removedPath || normalizedEntryPath.startsWith(`${removedPath}/`),
      );
    });
    nextEntries = mergeWorkspaceEntries(nextEntries, files);
  }

  return nextEntries;
}
