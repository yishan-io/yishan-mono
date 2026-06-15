import type {
  ProjectCommitComparisonCommit,
  ProjectCommitComparisonData,
  ProjectCommitComparisonSelection,
} from "../../../components/ProjectCommitComparison";
import type { ProjectGitChangeKind, ProjectGitChangesSection } from "../../../components/ProjectGitChangesList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepoChangesBySection = {
  unstaged: ProjectGitChangesSection["files"];
  staged: ProjectGitChangesSection["files"];
  untracked: ProjectGitChangesSection["files"];
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getParentPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const slashIndex = normalizedPath.lastIndexOf("/");
  return slashIndex <= 0 ? "" : normalizedPath.slice(0, slashIndex);
}

export function getFileExtension(path: string): string {
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function normalizeWorkspaceRelativePath(relativePath: string): string {
  const normalizedPath = relativePath.trim().replace(/\\/g, "/");
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return "";
  }

  return normalizedPath;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

export function dedupeChangedPaths(paths: string[]): string[] {
  const normalizedPaths = new Set<string>();
  for (const path of paths) {
    const normalizedPath = normalizeWorkspaceRelativePath(path);
    if (normalizedPath) {
      normalizedPaths.add(normalizedPath);
    }
  }
  return [...normalizedPaths];
}

export function dedupeRepoChangeFiles(files: ProjectGitChangesSection["files"]): ProjectGitChangesSection["files"] {
  const dedupedFilesByPath = new Map<string, ProjectGitChangesSection["files"][number]>();

  for (const file of files) {
    const normalizedPath = normalizeWorkspaceRelativePath(file.path);
    if (!normalizedPath) {
      continue;
    }

    const existingFile = dedupedFilesByPath.get(normalizedPath);
    if (!existingFile) {
      dedupedFilesByPath.set(normalizedPath, { ...file, path: normalizedPath });
      continue;
    }

    const mergedKind =
      existingFile.kind === "deleted" || file.kind === "deleted"
        ? "deleted"
        : existingFile.kind === "added" || file.kind === "added"
          ? "added"
          : "modified";

    dedupedFilesByPath.set(normalizedPath, {
      ...existingFile,
      kind: mergedKind,
      additions: Math.max(existingFile.additions, file.additions),
      deletions: Math.max(existingFile.deletions, file.deletions),
    });
  }

  return [...dedupedFilesByPath.values()];
}

// ---------------------------------------------------------------------------
// Rename-like pair reconciliation
// ---------------------------------------------------------------------------

/**
 * Detects rename-like pairs (deleted + added with same extension or directory)
 * and replaces them with a single "renamed" entry in the unstaged section.
 */
export function reconcileRenameLikePairs(input: RepoChangesBySection): RepoChangesBySection {
  const deletedUnstaged = input.unstaged.filter((file) => file.kind === "deleted");
  const addedUntracked = input.untracked.filter((file) => file.kind === "added");
  if (deletedUnstaged.length === 0 || addedUntracked.length === 0) {
    return input;
  }

  const renamedByNewPath = new Map<string, ProjectGitChangesSection["files"][number]>();
  const consumedDeletedPaths = new Set<string>();
  const consumedAddedPaths = new Set<string>();
  const addedCandidatesByPath = new Map(addedUntracked.map((file) => [file.path, file]));

  for (const deletedFile of deletedUnstaged) {
    const deletedExtension = getFileExtension(deletedFile.path);
    const deletedParentPath = getParentPath(deletedFile.path);
    const sameDirectoryCandidate = addedUntracked.find((candidate) => {
      if (consumedAddedPaths.has(candidate.path)) {
        return false;
      }

      if (getParentPath(candidate.path) !== deletedParentPath) {
        return false;
      }

      if (!deletedExtension) {
        return true;
      }

      return getFileExtension(candidate.path) === deletedExtension;
    });

    const extensionCandidate =
      sameDirectoryCandidate ??
      addedUntracked.find((candidate) => {
        if (consumedAddedPaths.has(candidate.path)) {
          return false;
        }

        return deletedExtension !== "" && getFileExtension(candidate.path) === deletedExtension;
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
        additions: Math.max(existingRename.additions, fallbackCandidate.additions, deletedFile.additions),
        deletions: Math.max(existingRename.deletions, fallbackCandidate.deletions, deletedFile.deletions),
      });
      continue;
    }

    renamedByNewPath.set(fallbackCandidate.path, {
      path: fallbackCandidate.path,
      kind: "renamed",
      additions: Math.max(fallbackCandidate.additions, deletedFile.additions),
      deletions: Math.max(fallbackCandidate.deletions, deletedFile.deletions),
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
    unstaged: dedupeRepoChangeFiles(nextUnstaged),
    untracked: dedupeRepoChangeFiles(nextUntracked),
  };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function normalizeProjectGitChangeKind(kind: string): ProjectGitChangeKind {
  if (kind === "added" || kind === "deleted" || kind === "modified" || kind === "renamed" || kind === "untracked") {
    return kind;
  }

  return "modified";
}

export function createEmptyRepoChangesBySection(): RepoChangesBySection {
  return { unstaged: [], staged: [], untracked: [] };
}

export function createEmptyRepoCommitComparison(): ProjectCommitComparisonData {
  return { currentBranch: "", targetBranch: "", allChangedFiles: [], commits: [] };
}

export function buildCommitChangesSection(commit: ProjectCommitComparisonCommit): ProjectGitChangesSection {
  return {
    id: "commit-files",
    label: `Changes in ${commit.shortHash}`,
    files: dedupeChangedPaths(commit.changedFiles).map((path) => ({
      path,
      kind: "modified" as const,
      additions: 0,
      deletions: 0,
    })),
  };
}

export function buildAllCommitChangesSection(
  allChangedFiles: string[],
  uncommittedKindByPath: Map<string, ProjectGitChangeKind>,
): ProjectGitChangesSection {
  return {
    id: "all-commit-files",
    label: "Changes in all",
    files: dedupeChangedPaths(allChangedFiles).map((path) => ({
      path,
      kind: uncommittedKindByPath.get(path) ?? ("modified" as const),
      additions: 0,
      deletions: 0,
    })),
  };
}
