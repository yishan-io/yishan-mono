import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectCommitComparisonCommit,
  ProjectCommitComparisonData,
  ProjectCommitComparisonSelection,
} from "../../../components/ProjectCommitComparison";
import type { ProjectGitChangeKind, ProjectGitChangesSection } from "../../../components/ProjectGitChangesList";
import { useCommands } from "../../../hooks/useCommands";
import { workspaceStore } from "../../../store/workspaceStore";

type RepoChangesBySection = {
  unstaged: ProjectGitChangesSection["files"];
  staged: ProjectGitChangesSection["files"];
  untracked: ProjectGitChangesSection["files"];
};

function getParentPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const slashIndex = normalizedPath.lastIndexOf("/");
  return slashIndex <= 0 ? "" : normalizedPath.slice(0, slashIndex);
}

function getFileExtension(path: string): string {
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function reconcileRenameLikePairs(input: RepoChangesBySection): RepoChangesBySection {
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

export function normalizeWorkspaceRelativePath(relativePath: string): string {
  const normalizedPath = relativePath.trim().replace(/\\/g, "/");
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return "";
  }

  return normalizedPath;
}

function dedupeChangedPaths(paths: string[]): string[] {
  const normalizedPaths = new Set<string>();
  for (const path of paths) {
    const normalizedPath = normalizeWorkspaceRelativePath(path);
    if (normalizedPath) {
      normalizedPaths.add(normalizedPath);
    }
  }
  return [...normalizedPaths];
}

function dedupeRepoChangeFiles(files: ProjectGitChangesSection["files"]): ProjectGitChangesSection["files"] {
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

function normalizeProjectGitChangeKind(kind: string): ProjectGitChangeKind {
  if (kind === "added" || kind === "deleted" || kind === "modified" || kind === "renamed" || kind === "untracked") {
    return kind;
  }

  return "modified";
}

function createEmptyRepoChangesBySection(): RepoChangesBySection {
  return { unstaged: [], staged: [], untracked: [] };
}

function createEmptyRepoCommitComparison(): ProjectCommitComparisonData {
  return { currentBranch: "", targetBranch: "", allChangedFiles: [], commits: [] };
}

function buildCommitChangesSection(commit: ProjectCommitComparisonCommit): ProjectGitChangesSection {
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

function buildAllCommitChangesSection(
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

export function useChangesTabState() {
  const { t } = useTranslation();
  const [repoChangesBySection, setRepoChangesBySection] = useState<RepoChangesBySection>(
    createEmptyRepoChangesBySection,
  );
  const [repoCommitComparison, setRepoCommitComparison] = useState<ProjectCommitComparisonData>(
    createEmptyRepoCommitComparison,
  );
  const [isRepoChangesLoading, setIsRepoChangesLoading] = useState(false);
  const [isCommitComparisonLoading, setIsCommitComparisonLoading] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<ProjectCommitComparisonSelection>("uncommitted");
  const commitComparisonRequestIdRef = useRef(0);
  const repoChangesLoadRequestIdRef = useRef(0);
  const pendingWorkspaceSwitchLoadPathRef = useRef<string | null>(null);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const selectedWorkspace = workspaceStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId),
  );
  const selectedWorkspaceWorktreePath = selectedWorkspace?.worktreePath;
  const selectedWorkspaceSourceBranch = workspaceStore((state) => {
    const workspace = state.workspaces.find((w) => w.id === state.selectedWorkspaceId);
    const raw =
      workspace?.sourceBranch?.trim() ||
      (state.projects ?? [])
        .find((project) => project.id === (workspace?.projectId ?? workspace?.repoId))
        ?.defaultBranch?.trim() ||
      "main";
    return raw.includes("/") ? raw : `origin/${raw}`;
  });
  const workspaceGitRefreshVersion = workspaceStore((state) => {
    if (!selectedWorkspaceWorktreePath) {
      return 0;
    }
    return state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0;
  });
  const { listGitChanges, listGitCommitsToTarget } = useCommands();

  const loadCommitComparison = useCallback(
    async (targetBranch: string, showProgress = false) => {
      if (!selectedWorkspaceWorktreePath || !targetBranch) {
        setRepoCommitComparison(createEmptyRepoCommitComparison());
        if (showProgress) {
          setIsCommitComparisonLoading(false);
        }
        return;
      }
      if (showProgress) {
        setIsCommitComparisonLoading(true);
      }
      const requestId = commitComparisonRequestIdRef.current + 1;
      commitComparisonRequestIdRef.current = requestId;
      try {
        const commitComparison = await listGitCommitsToTarget({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          targetBranch,
        });
        if (commitComparisonRequestIdRef.current === requestId) {
          setRepoCommitComparison(commitComparison);
        }
      } catch (error) {
        if (commitComparisonRequestIdRef.current === requestId) {
          setRepoCommitComparison(createEmptyRepoCommitComparison());
          console.error("Failed to load workspace commit comparison", error);
        }
      } finally {
        if (showProgress && commitComparisonRequestIdRef.current === requestId) {
          setIsCommitComparisonLoading(false);
        }
      }
    },
    [listGitCommitsToTarget, selectedWorkspaceWorktreePath],
  );

  const refreshChanges = useCallback(async () => {
    const requestId = repoChangesLoadRequestIdRef.current + 1;
    repoChangesLoadRequestIdRef.current = requestId;
    const shouldShowLoadingForRequest =
      Boolean(selectedWorkspaceWorktreePath) &&
      pendingWorkspaceSwitchLoadPathRef.current === selectedWorkspaceWorktreePath;

    if (!selectedWorkspaceWorktreePath) {
      setRepoChangesBySection(createEmptyRepoChangesBySection());
      setRepoCommitComparison(createEmptyRepoCommitComparison());
      if (repoChangesLoadRequestIdRef.current === requestId) {
        pendingWorkspaceSwitchLoadPathRef.current = null;
        setIsRepoChangesLoading(false);
      }
      return;
    }

    try {
      const response = await listGitChanges({ workspaceWorktreePath: selectedWorkspaceWorktreePath });
      const dedupedResponse: RepoChangesBySection = {
        unstaged: dedupeRepoChangeFiles(
          response.unstaged.map((file) => ({ ...file, kind: normalizeProjectGitChangeKind(file.kind) })),
        ),
        staged: dedupeRepoChangeFiles(
          response.staged.map((file) => ({ ...file, kind: normalizeProjectGitChangeKind(file.kind) })),
        ),
        untracked: dedupeRepoChangeFiles(
          response.untracked.map((file) => ({ ...file, kind: normalizeProjectGitChangeKind(file.kind) })),
        ),
      };
      setRepoChangesBySection(reconcileRenameLikePairs(dedupedResponse));
      if (shouldShowLoadingForRequest && repoChangesLoadRequestIdRef.current === requestId) {
        pendingWorkspaceSwitchLoadPathRef.current = null;
        setIsRepoChangesLoading(false);
      }
      if (!selectedWorkspaceSourceBranch) {
        setRepoCommitComparison(createEmptyRepoCommitComparison());
        return;
      }
      await loadCommitComparison(selectedWorkspaceSourceBranch);
    } catch (error) {
      setRepoChangesBySection(createEmptyRepoChangesBySection());
      setRepoCommitComparison(createEmptyRepoCommitComparison());
      console.error("Failed to load workspace git changes", error);
    }
  }, [listGitChanges, loadCommitComparison, selectedWorkspaceSourceBranch, selectedWorkspaceWorktreePath]);

  useEffect(() => {
    if (!selectedWorkspaceWorktreePath) {
      pendingWorkspaceSwitchLoadPathRef.current = null;
      setIsRepoChangesLoading(false);
      return;
    }
    pendingWorkspaceSwitchLoadPathRef.current = selectedWorkspaceWorktreePath;
    setIsRepoChangesLoading(true);
  }, [selectedWorkspaceWorktreePath]);

  useEffect(() => {
    setSelectedComparison("uncommitted");
  }, [selectedWorkspaceSourceBranch]);

  useEffect(() => {
    if (
      selectedComparison !== "uncommitted" &&
      selectedComparison !== "all" &&
      !repoCommitComparison.commits.some((commit) => commit.hash === selectedComparison)
    ) {
      setSelectedComparison("uncommitted");
    }
  }, [repoCommitComparison.commits, selectedComparison]);

  useEffect(() => {
    if (!selectedWorkspaceWorktreePath) {
      return;
    }
    void workspaceGitRefreshVersion;
    let cancelled = false;
    let inFlight = false;
    let queued = false;

    const refreshNow = async () => {
      if (cancelled || inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        await refreshChanges();
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void refreshNow();
        }
      }
    };

    void refreshNow();
    return () => {
      cancelled = true;
    };
  }, [refreshChanges, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);

  const repoChanges: ProjectGitChangesSection[] = useMemo(
    () => [
      { id: "staged", label: t("files.git.staged"), files: repoChangesBySection.staged },
      { id: "unstaged", label: t("files.git.unstaged"), files: repoChangesBySection.unstaged },
      { id: "untracked", label: t("files.git.untracked"), files: repoChangesBySection.untracked },
    ],
    [repoChangesBySection.staged, repoChangesBySection.unstaged, repoChangesBySection.untracked, t],
  );

  const selectedCommit = useMemo(
    () => repoCommitComparison.commits.find((commit) => commit.hash === selectedComparison) ?? null,
    [repoCommitComparison.commits, selectedComparison],
  );

  const mergedAllChangedFiles = useMemo(() => {
    const allPaths = new Set<string>();
    for (const path of repoCommitComparison.allChangedFiles) {
      const normalized = normalizeWorkspaceRelativePath(path);
      if (normalized) {
        allPaths.add(normalized);
      }
    }
    for (const section of [
      repoChangesBySection.staged,
      repoChangesBySection.unstaged,
      repoChangesBySection.untracked,
    ]) {
      for (const file of section) {
        const normalized = normalizeWorkspaceRelativePath(file.path);
        if (normalized) {
          allPaths.add(normalized);
        }
      }
    }
    return [...allPaths];
  }, [
    repoCommitComparison.allChangedFiles,
    repoChangesBySection.staged,
    repoChangesBySection.unstaged,
    repoChangesBySection.untracked,
  ]);

  const mergedComparison = useMemo<ProjectCommitComparisonData>(
    () => ({ ...repoCommitComparison, allChangedFiles: mergedAllChangedFiles }),
    [repoCommitComparison, mergedAllChangedFiles],
  );

  const uncommittedKindByPath = useMemo(() => {
    const kindByPath = new Map<string, ProjectGitChangeKind>();
    for (const section of [
      { id: "staged", files: repoChangesBySection.staged },
      { id: "unstaged", files: repoChangesBySection.unstaged },
      { id: "untracked", files: repoChangesBySection.untracked },
    ] as const) {
      for (const file of section.files) {
        const normalizedPath = normalizeWorkspaceRelativePath(file.path);
        if (!normalizedPath) {
          continue;
        }
        kindByPath.set(
          normalizedPath,
          section.id === "untracked" ? "untracked" : normalizeProjectGitChangeKind(file.kind),
        );
      }
    }
    return kindByPath;
  }, [repoChangesBySection.staged, repoChangesBySection.unstaged, repoChangesBySection.untracked]);

  const visibleChanges = useMemo(() => {
    if (selectedComparison === "uncommitted") {
      return repoChanges;
    }
    if (selectedComparison === "all") {
      return [buildAllCommitChangesSection(mergedAllChangedFiles, uncommittedKindByPath)];
    }
    if (selectedCommit) {
      return [buildCommitChangesSection(selectedCommit)];
    }
    return repoChanges;
  }, [repoChanges, mergedAllChangedFiles, selectedCommit, selectedComparison, uncommittedKindByPath]);

  const isCommitChangesMode = selectedComparison !== "uncommitted";

  return {
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    selectedWorkspaceSourceBranch,
    isRepoChangesLoading,
    isCommitComparisonLoading,
    selectedComparison,
    repoCommitComparison: mergedComparison,
    visibleChanges,
    isCommitChangesMode,
    refreshChanges,
    selectUncommitted: () => setSelectedComparison("uncommitted"),
    selectAll: () => setSelectedComparison("all"),
    selectCommit: (commit: ProjectCommitComparisonCommit) => {
      setSelectedComparison((previous) => (previous === commit.hash ? "uncommitted" : commit.hash));
    },
  };
}
