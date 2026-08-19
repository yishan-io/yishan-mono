export type FileTreeMoveUndoEntry = {
  fromPath: string;
  toPath: string;
};

/** Normalizes one workspace-relative path for client-side comparisons. */
export function normalizeRelativePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Returns the final path segment from one workspace-relative path. */
export function getPathName(path: string): string {
  const normalizedPath = normalizeRelativePath(path);
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

/** Returns the parent directory path from one workspace-relative path. */
export function getParentRelativePath(path: string): string {
  const normalizedPath = normalizeRelativePath(path);
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

/** Joins one directory path and child entry name into one workspace-relative path. */
function joinRelativePath(basePath: string, childName: string): string {
  const normalizedBasePath = normalizeRelativePath(basePath);
  return normalizedBasePath ? `${normalizedBasePath}/${childName}` : childName;
}

/** Creates one indexed duplicate entry name while preserving a file extension when present. */
function createIndexedPathName(entryName: string, index: number): string {
  const extensionIndex = entryName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === entryName.length - 1) {
    return `${entryName}-${index}`;
  }

  const stem = entryName.slice(0, extensionIndex);
  const extension = entryName.slice(extensionIndex);
  return `${stem}-${index}${extension}`;
}

/** Resolves one non-conflicting destination path using backend-compatible duplicate naming rules. */
function resolveUniqueDestinationPath(
  existingPaths: Set<string>,
  destinationDirectoryPath: string,
  entryName: string,
): string {
  let attemptName = entryName;
  let index = 1;

  for (;;) {
    const attemptPath = joinRelativePath(destinationDirectoryPath, attemptName);
    if (!existingPaths.has(attemptPath)) {
      return attemptPath;
    }

    attemptName = createIndexedPathName(entryName, index);
    index += 1;
  }
}

/** Computes undo move mappings from pre-move tree state for one move paste operation. */
export function buildMoveUndoEntries(
  repoFiles: string[],
  sourcePaths: string[],
  destinationPath: string,
): FileTreeMoveUndoEntry[] {
  const normalizedDestinationPath = normalizeRelativePath(destinationPath);
  const existingPaths = new Set(repoFiles.map((path) => normalizeRelativePath(path)).filter(Boolean));
  const entries: FileTreeMoveUndoEntry[] = [];

  for (const sourcePath of sourcePaths) {
    const normalizedSourcePath = normalizeRelativePath(sourcePath);
    if (!normalizedSourcePath) {
      continue;
    }

    if (getParentRelativePath(normalizedSourcePath) === normalizedDestinationPath) {
      continue;
    }

    const sourceName = getPathName(normalizedSourcePath);
    if (!sourceName) {
      continue;
    }

    const destinationEntryPath = resolveUniqueDestinationPath(existingPaths, normalizedDestinationPath, sourceName);
    for (const existingPath of [...existingPaths]) {
      if (existingPath === normalizedSourcePath || existingPath.startsWith(`${normalizedSourcePath}/`)) {
        existingPaths.delete(existingPath);
      }
    }
    existingPaths.add(destinationEntryPath);
    entries.push({
      fromPath: normalizedSourcePath,
      toPath: destinationEntryPath,
    });
  }

  return entries;
}

/** Returns true when candidate is an indexed duplicate form of sourceName (for example, a-1.ts). */
function isIndexedDuplicatePathName(candidateName: string, sourceName: string): boolean {
  const extensionIndex = sourceName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === sourceName.length - 1) {
    if (!candidateName.startsWith(`${sourceName}-`)) {
      return false;
    }

    const suffix = candidateName.slice(sourceName.length + 1);
    return /^[0-9]+$/.test(suffix);
  }

  const sourceStem = sourceName.slice(0, extensionIndex);
  const sourceExtension = sourceName.slice(extensionIndex);
  if (!candidateName.startsWith(`${sourceStem}-`) || !candidateName.endsWith(sourceExtension)) {
    return false;
  }

  const suffix = candidateName.slice(sourceStem.length + 1, -sourceExtension.length);
  return /^[0-9]+$/.test(suffix);
}

/** Resolves one preferred focus path for post-paste/drop selection from before/after tree snapshots. */
export function resolvePreferredImportedPath(
  previousRepoFiles: string[],
  nextRepoFiles: string[],
  destinationPath: string,
  sourcePaths: string[],
): string | null {
  const previousPathSet = new Set(previousRepoFiles.map((path) => normalizeRelativePath(path)).filter(Boolean));
  const addedPaths = nextRepoFiles
    .map((path) => normalizeRelativePath(path))
    .filter((path) => Boolean(path) && !previousPathSet.has(path))
    .sort((leftPath, rightPath) => {
      const depthDiff = leftPath.split("/").length - rightPath.split("/").length;
      if (depthDiff !== 0) {
        return depthDiff;
      }
      return leftPath.localeCompare(rightPath);
    });
  if (addedPaths.length === 0) {
    return null;
  }

  const normalizedDestinationPath = normalizeRelativePath(destinationPath);
  const destinationCandidatePaths = addedPaths.filter((path) => {
    if (!normalizedDestinationPath) {
      return true;
    }

    return path === normalizedDestinationPath || path.startsWith(`${normalizedDestinationPath}/`);
  });
  const candidatePaths = destinationCandidatePaths.length > 0 ? destinationCandidatePaths : addedPaths;
  const sourceNames = sourcePaths.map((path) => getPathName(path)).filter(Boolean);

  for (const sourceName of sourceNames) {
    const exactMatch = candidatePaths.find((path) => getPathName(path) === sourceName);
    if (exactMatch) {
      return exactMatch;
    }

    const duplicateMatch = candidatePaths.find((path) => isIndexedDuplicatePathName(getPathName(path), sourceName));
    if (duplicateMatch) {
      return duplicateMatch;
    }
  }

  return candidatePaths[0] ?? null;
}
