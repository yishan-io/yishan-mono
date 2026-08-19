export function countWorkspaceGitChanges(sections: {
  staged: unknown[];
  unstaged: unknown[];
  untracked: unknown[];
}): number {
  return sections.staged.length + sections.unstaged.length + sections.untracked.length;
}

/** Sums additions and deletions across staged, unstaged, and untracked file sections. */
export function summarizeWorkspaceGitChangeTotals(sections: {
  staged: Array<{ additions: number; deletions: number }>;
  unstaged: Array<{ additions: number; deletions: number }>;
  untracked: Array<{ additions: number; deletions: number }>;
}): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const section of [sections.staged, sections.unstaged, sections.untracked]) {
    for (const file of section) {
      additions += Math.max(0, file.additions);
      deletions += Math.max(0, file.deletions);
    }
  }

  return {
    additions,
    deletions,
  };
}

type GitChangeEntry = {
  path: string;
  kind: string;
  additions: number;
  deletions: number;
};

type GitChangeSections = {
  staged: GitChangeEntry[];
  unstaged: GitChangeEntry[];
  untracked: GitChangeEntry[];
};

function normalizeGitChangeKind(kind: string): string {
  if (kind === "added" || kind === "deleted" || kind === "modified" || kind === "renamed") {
    return kind;
  }
  return "modified";
}

function normalizeGitPath(path: string): string {
  const normalizedPath = path.trim().replace(/\\/g, "/");
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return "";
  }
  return normalizedPath;
}

function dedupeGitChangeFiles(files: GitChangeEntry[]): GitChangeEntry[] {
  const byPath = new Map<string, GitChangeEntry>();
  for (const file of files) {
    const normalized = normalizeGitPath(file.path);
    if (!normalized) continue;
    const existing = byPath.get(normalized);
    if (!existing) {
      byPath.set(normalized, { ...file, path: normalized });
      continue;
    }
    const mergedKind =
      existing.kind === "deleted" || file.kind === "deleted"
        ? "deleted"
        : existing.kind === "added" || file.kind === "added"
          ? "added"
          : "modified";
    byPath.set(normalized, {
      ...existing,
      kind: mergedKind,
      additions: Math.max(existing.additions, file.additions),
      deletions: Math.max(existing.deletions, file.deletions),
    });
  }
  return [...byPath.values()];
}

function getGitChangeParentPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const slashIndex = normalizedPath.lastIndexOf("/");
  return slashIndex <= 0 ? "" : normalizedPath.slice(0, slashIndex);
}

function getGitChangeFileExtension(path: string): string {
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function reconcileGitRenameLikePairs(input: GitChangeSections): GitChangeSections {
  const deletedUnstaged = input.unstaged.filter((file) => file.kind === "deleted");
  const addedUntracked = input.untracked.filter((file) => file.kind === "added");
  if (deletedUnstaged.length === 0 || addedUntracked.length === 0) {
    return input;
  }

  const renamedByNewPath = new Map<string, GitChangeEntry>();
  const consumedDeletedPaths = new Set<string>();
  const consumedAddedPaths = new Set<string>();
  const addedCandidatesByPath = new Map(addedUntracked.map((file) => [file.path, file]));

  for (const deletedFile of deletedUnstaged) {
    const deletedExtension = getGitChangeFileExtension(deletedFile.path);
    const deletedParentPath = getGitChangeParentPath(deletedFile.path);
    const sameDirectoryCandidate = addedUntracked.find((candidate) => {
      if (consumedAddedPaths.has(candidate.path)) {
        return false;
      }
      if (getGitChangeParentPath(candidate.path) !== deletedParentPath) {
        return false;
      }
      if (!deletedExtension) {
        return true;
      }
      return getGitChangeFileExtension(candidate.path) === deletedExtension;
    });

    const extensionCandidate =
      sameDirectoryCandidate ??
      addedUntracked.find((candidate) => {
        if (consumedAddedPaths.has(candidate.path)) {
          return false;
        }
        return deletedExtension !== "" && getGitChangeFileExtension(candidate.path) === deletedExtension;
      });

    const fallbackCandidate = extensionCandidate;

    if (!fallbackCandidate) {
      continue;
    }

    consumedDeletedPaths.add(deletedFile.path);
    consumedAddedPaths.add(fallbackCandidate.path);
    const existingRename = renamedByNewPath.get(fallbackCandidate.path);
    if (existingRename) {
      renamedByNewPath.set(fallbackCandidate.path, {
        ...existingRename,
        additions: Math.max(existingRename.additions, fallbackCandidate.additions),
        deletions: Math.max(existingRename.deletions, fallbackCandidate.deletions),
      });
      continue;
    }

    renamedByNewPath.set(fallbackCandidate.path, {
      path: fallbackCandidate.path,
      kind: "renamed",
      additions: Math.max(0, fallbackCandidate.additions),
      deletions: Math.max(0, fallbackCandidate.deletions),
    });
  }

  if (renamedByNewPath.size === 0) {
    return input;
  }

  const nextUnstaged = [
    ...input.unstaged.filter((file) => !consumedDeletedPaths.has(file.path)),
    ...renamedByNewPath.values(),
  ];
  const nextUntracked = input.untracked.filter((file) => {
    if (!consumedAddedPaths.has(file.path)) {
      return true;
    }
    return !addedCandidatesByPath.has(file.path);
  });

  return {
    ...input,
    unstaged: dedupeGitChangeFiles(nextUnstaged),
    untracked: dedupeGitChangeFiles(nextUntracked),
  };
}

function processGitChangeSections(sections: GitChangeSections): GitChangeSections {
  const deduped: GitChangeSections = {
    unstaged: dedupeGitChangeFiles(sections.unstaged.map((f) => ({ ...f, kind: normalizeGitChangeKind(f.kind) }))),
    staged: dedupeGitChangeFiles(sections.staged.map((f) => ({ ...f, kind: normalizeGitChangeKind(f.kind) }))),
    untracked: dedupeGitChangeFiles(sections.untracked.map((f) => ({ ...f, kind: normalizeGitChangeKind(f.kind) }))),
  };
  return reconcileGitRenameLikePairs(deduped);
}

export function summarizeReconciledWorkspaceGitChangeTotals(rawSections: {
  staged: Array<{ path: string; kind: string; additions: number; deletions: number }>;
  unstaged: Array<{ path: string; kind: string; additions: number; deletions: number }>;
  untracked: Array<{ path: string; kind: string; additions: number; deletions: number }>;
}): { additions: number; deletions: number } {
  const processed = processGitChangeSections(rawSections);
  let additions = 0;
  let deletions = 0;
  for (const section of [processed.staged, processed.unstaged, processed.untracked]) {
    for (const file of section) {
      additions += Math.max(0, file.additions);
      deletions += Math.max(0, file.deletions);
    }
  }
  return { additions, deletions };
}

export function computeUniqueGitChangeFileCount(
  branchDiffFiles: string[],
  rawSections: {
    staged: Array<{ path: string; kind: string; additions: number; deletions: number }>;
    unstaged: Array<{ path: string; kind: string; additions: number; deletions: number }>;
    untracked: Array<{ path: string; kind: string; additions: number; deletions: number }>;
  },
): number {
  const processed = processGitChangeSections(rawSections);
  const allPaths = new Set<string>();
  for (const path of branchDiffFiles) {
    const normalized = normalizeGitPath(path);
    if (normalized) allPaths.add(normalized);
  }
  for (const file of [...processed.staged, ...processed.unstaged, ...processed.untracked]) {
    const normalized = normalizeGitPath(file.path);
    if (normalized) allPaths.add(normalized);
  }
  return allPaths.size;
}
