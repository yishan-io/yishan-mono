import type { WorkspaceFileEntry } from "@shared/contracts/rpcRequestTypes";
import { normalizeRelativePath } from "../fileTreePathHelpers";

export function mergeWorkspaceEntries(
  current: WorkspaceFileEntry[],
  incoming: WorkspaceFileEntry[],
): WorkspaceFileEntry[] {
  const mergedByPath = new Map<string, WorkspaceFileEntry>();

  for (const entry of current) {
    mergedByPath.set(entry.path, entry);
  }

  for (const entry of incoming) {
    const existingEntry = mergedByPath.get(entry.path);
    if (!existingEntry) {
      mergedByPath.set(entry.path, entry);
      continue;
    }

    mergedByPath.set(entry.path, {
      ...entry,
      isIgnored: existingEntry.isIgnored || entry.isIgnored,
    });
  }

  return [...mergedByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function isPathWithinOrEqual(path: string, candidateParentPath: string): boolean {
  return path === candidateParentPath || path.startsWith(`${candidateParentPath}/`);
}

export function buildNormalizedPathSet(entries: WorkspaceFileEntry[]): Set<string> {
  const normalizedPaths = new Set<string>();
  for (const entry of entries) {
    const normalizedEntryPath = normalizeRelativePath(entry.path);
    if (!normalizedEntryPath) {
      continue;
    }

    normalizedPaths.add(normalizedEntryPath);
  }

  return normalizedPaths;
}

export function hasVisibleImmediateChildren(directoryPath: string, entries: WorkspaceFileEntry[]): boolean {
  const normalizedDirectoryPath = normalizeRelativePath(directoryPath);
  if (!normalizedDirectoryPath) {
    return false;
  }

  return entries.some((entry) => {
    if (entry.isIgnored) {
      return false;
    }

    const normalizedEntryPath = normalizeRelativePath(entry.path);
    if (!normalizedEntryPath || normalizedEntryPath === normalizedDirectoryPath) {
      return false;
    }

    return normalizedEntryPath.startsWith(`${normalizedDirectoryPath}/`);
  });
}
