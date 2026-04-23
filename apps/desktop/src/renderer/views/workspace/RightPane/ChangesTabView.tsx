import { Box, LinearProgress } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ProjectCommitComparison,
  type ProjectCommitComparisonCommit,
  type ProjectCommitComparisonData,
  type ProjectCommitComparisonSelection,
} from "../../../components/ProjectCommitComparison";
import { ProjectGitChangesList, type ProjectGitChangesSection } from "../../../components/ProjectGitChangesList";
import { useCommands } from "../../../hooks/useCommands";
import { workspaceStore } from "../../../store/workspaceStore";

type RepoChangesBySection = {
  unstaged: ProjectGitChangesSection["files"];
  staged: ProjectGitChangesSection["files"];
  untracked: ProjectGitChangesSection["files"];
};

/** Normalizes one workspace-relative path for consistent rendering and diff lookups. */
function normalizeWorkspaceRelativePath(relativePath: string): string {
  const normalizedPath = relativePath.trim().replace(/\\/g, "/");
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return "";
  }

  return normalizedPath;
}

/** Deduplicates plain changed-file path values while preserving first-seen order. */
function dedupeChangedPaths(paths: string[]): string[] {
  const normalizedPaths = new Set<string>();

  for (const path of paths) {
    const normalizedPath = normalizeWorkspaceRelativePath(path);
    if (!normalizedPath) {
      continue;
    }

    normalizedPaths.add(normalizedPath);
  }

  return [...normalizedPaths];
}

/** Merges duplicate file entries so one rendered row always maps to one normalized path. */
function dedupeRepoChangeFiles(files: ProjectGitChangesSection["files"]): ProjectGitChangesSection["files"] {
  const dedupedFilesByPath = new Map<string, ProjectGitChangesSection["files"][number]>();

  for (const file of files) {
    const normalizedPath = normalizeWorkspaceRelativePath(file.path);
    if (!normalizedPath) {
      continue;
    }

    const existingFile = dedupedFilesByPath.get(normalizedPath);
    if (!existingFile) {
      dedupedFilesByPath.set(normalizedPath, {
        ...file,
        path: normalizedPath,
      });
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

/** Resolves an absolute path by joining worktree root and relative file path. */
function resolveWorkspaceAbsolutePath(worktreePath: string, relativePath: string): string {
  const trimmedRoot = worktreePath.replace(/\/+$/, "");
  const trimmedRelative = relativePath.replace(/^\/+/, "");
  return `${trimmedRoot}/${trimmedRelative}`;
}

/** Creates one empty git-section snapshot used for initialization and error fallback. */
function createEmptyRepoChangesBySection(): RepoChangesBySection {
  return {
    unstaged: [],
    staged: [],
    untracked: [],
  };
}

/** Creates one empty commit-comparison snapshot used for initialization and fallback. */
function createEmptyRepoCommitComparison(): ProjectCommitComparisonData {
  return {
    currentBranch: "",
    targetBranch: "",
    allChangedFiles: [],
    commits: [],
  };
}

/** Maps one commit changed-file list into one read-only git section for the lower pane. */
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

/** Maps all branch-comparison changed files into one read-only section for aggregate browsing. */
function buildAllCommitChangesSection(allChangedFiles: string[]): ProjectGitChangesSection {
  return {
    id: "all-commit-files",
    label: "Changes in all",
    files: dedupeChangedPaths(allChangedFiles).map((path) => ({
      path,
      kind: "modified" as const,
      additions: 0,
      deletions: 0,
    })),
  };
}

/** Renders change-related right pane content for comparison scope and file lists. */
export function ChangesTabView() {
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
  const selectedWorkspaceSourceBranch = selectedWorkspace?.sourceBranch?.trim();
  const workspaceGitRefreshVersion = workspaceStore((state) => {
    if (!selectedWorkspaceWorktreePath) {
      return 0;
    }

    return state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0;
  });
  const {
    openTab,
    listGitChanges,
    listGitCommitsToTarget,
    readBranchComparisonDiff,
    readCommitDiff,
    readDiff,
    revertGitChanges,
    trackGitChanges,
    unstageGitChanges,
  } = useCommands();

  /**
   * Loads commit comparison for one target branch and ignores stale async responses.
   */
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

        if (commitComparisonRequestIdRef.current !== requestId) {
          return;
        }

        setRepoCommitComparison(commitComparison);
      } catch (error) {
        if (commitComparisonRequestIdRef.current !== requestId) {
          return;
        }

        setRepoCommitComparison(createEmptyRepoCommitComparison());
        console.error("Failed to load workspace commit comparison", error);
      } finally {
        if (showProgress && commitComparisonRequestIdRef.current === requestId) {
          setIsCommitComparisonLoading(false);
        }
      }
    },
    [listGitCommitsToTarget, selectedWorkspaceWorktreePath],
  );

  const loadRepoChanges = useCallback(async () => {
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
      const response = await listGitChanges({
        workspaceWorktreePath: selectedWorkspaceWorktreePath,
      });

      const dedupedResponse: RepoChangesBySection = {
        unstaged: dedupeRepoChangeFiles(response.unstaged),
        staged: dedupeRepoChangeFiles(response.staged),
        untracked: dedupeRepoChangeFiles(response.untracked),
      };

      setRepoChangesBySection(dedupedResponse);
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
    } finally {
      if (repoChangesLoadRequestIdRef.current === requestId) {
        if (shouldShowLoadingForRequest && pendingWorkspaceSwitchLoadPathRef.current) {
          pendingWorkspaceSwitchLoadPathRef.current = null;
          setIsRepoChangesLoading(false);
        }
      }
    }
  }, [listGitChanges, loadCommitComparison, selectedWorkspaceSourceBranch, selectedWorkspaceWorktreePath]);

  const repoChanges: RepoGitChangesSection[] = useMemo(
    () => [
      {
        id: "staged",
        label: t("files.git.staged"),
        files: repoChangesBySection.staged,
      },
      {
        id: "unstaged",
        label: t("files.git.unstaged"),
        files: repoChangesBySection.unstaged,
      },
      {
        id: "untracked",
        label: t("files.git.untracked"),
        files: repoChangesBySection.untracked,
      },
    ],
    [repoChangesBySection.staged, repoChangesBySection.unstaged, repoChangesBySection.untracked, t],
  );

  const selectedCommit = useMemo(
    () => repoCommitComparison.commits.find((commit) => commit.hash === selectedComparison) ?? null,
    [repoCommitComparison.commits, selectedComparison],
  );

  const visibleChanges = useMemo(() => {
    if (selectedComparison === "uncommitted") {
      return repoChanges;
    }

    if (selectedComparison === "all") {
      return [buildAllCommitChangesSection(repoCommitComparison.allChangedFiles)];
    }

    if (selectedCommit) {
      return [buildCommitChangesSection(selectedCommit)];
    }

    return repoChanges;
  }, [repoChanges, repoCommitComparison.allChangedFiles, selectedCommit, selectedComparison]);

  const isCommitChangesMode = selectedComparison !== "uncommitted";

  /** Stages the provided paths then refreshes workspace git sections. */
  const handleTrackPaths = async (relativePaths: string[]) => {
    if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
      return;
    }

    await trackGitChanges({
      workspaceWorktreePath: selectedWorkspaceWorktreePath,
      relativePaths,
    });
    await loadRepoChanges();
  };

  /** Reverts the provided paths then refreshes workspace git sections. */
  const handleRevertPaths = async (relativePaths: string[]) => {
    if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
      return;
    }

    await revertGitChanges({
      workspaceWorktreePath: selectedWorkspaceWorktreePath,
      relativePaths,
    });
    await loadRepoChanges();
  };

  /** Unstages the provided paths then refreshes workspace git sections. */
  const handleUnstagePaths = async (relativePaths: string[]) => {
    if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
      return;
    }

    await unstageGitChanges({
      workspaceWorktreePath: selectedWorkspaceWorktreePath,
      relativePaths,
    });
    await loadRepoChanges();
  };

  /** Opens one diff tab for a selected compared file from commit or all-changes modes. */
  const handleSelectCommitChangedFile = async (relativePath: string, commitHash?: string, targetBranch?: string) => {
    if (!selectedWorkspaceWorktreePath) {
      return;
    }

    const normalizedRelativePath = normalizeWorkspaceRelativePath(relativePath);
    if (!normalizedRelativePath) {
      return;
    }

    try {
      const response = commitHash
        ? await readCommitDiff({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            commitHash,
            relativePath: normalizedRelativePath,
          })
        : targetBranch
          ? await readBranchComparisonDiff({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              targetBranch,
              relativePath: normalizedRelativePath,
            })
          : await readDiff({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              relativePath: normalizedRelativePath,
            });

      openTab({
        workspaceId: selectedWorkspaceId,
        kind: "diff",
        path: normalizedRelativePath,
        changeKind: "modified",
        additions: 0,
        deletions: 0,
        oldContent: response.oldContent,
        newContent: response.newContent,
      });
    } catch (error) {
      console.error("Failed to load workspace commit file diff", error);
      openTab({
        workspaceId: selectedWorkspaceId,
        kind: "diff",
        path: normalizedRelativePath,
        changeKind: "modified",
        additions: 0,
        deletions: 0,
      });
    }
  };

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
    if (!selectedWorkspaceSourceBranch) {
      setSelectedComparison("uncommitted");
      return;
    }

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

    const refreshRepoChangesNow = async () => {
      if (cancelled || inFlight) {
        queued = true;
        return;
      }

      inFlight = true;

      try {
        await loadRepoChanges();
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void refreshRepoChangesNow();
        }
      }
    };

    void refreshRepoChangesNow();

    return () => {
      cancelled = true;
    };
  }, [loadRepoChanges, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {isRepoChangesLoading ? (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
          <LinearProgress
            data-testid="changes-tab-loading-progress"
            sx={{ width: 120, height: 3, borderRadius: 999, overflow: "hidden" }}
          />
        </Box>
      ) : (
        <>
          <Box
            sx={{
              minWidth: 0,
              px: 1.5,
              pt: 1,
              pb: 1,
            }}
          >
            <ProjectCommitComparison
              comparison={repoCommitComparison}
              targetBranch={selectedWorkspaceSourceBranch ?? ""}
              selectedComparison={selectedComparison}
              onSelectUncommitted={() => {
                setSelectedComparison("uncommitted");
              }}
              onSelectAll={() => {
                setSelectedComparison("all");
              }}
              onSelectCommit={(commit) => {
                setSelectedComparison((previous) => (previous === commit.hash ? "uncommitted" : commit.hash));
              }}
              isTargetBranchLoading={isCommitComparisonLoading}
              comparisonScopeAriaLabel={t("files.git.changeScope")}
            />
          </Box>
          <ProjectGitChangesList
            sections={visibleChanges}
            readOnly={isCommitChangesMode}
            onTrackSection={
              isCommitChangesMode
                ? undefined
                : (section) =>
                    void (section.id === "staged"
                      ? handleUnstagePaths(section.files.map((file) => file.path))
                      : handleTrackPaths(section.files.map((file) => file.path)))
            }
            onRevertSection={
              isCommitChangesMode
                ? undefined
                : (section) => void handleRevertPaths(section.files.map((file) => file.path))
            }
            onTrackFile={
              isCommitChangesMode
                ? undefined
                : (file, sectionId) =>
                    void (sectionId === "staged" ? handleUnstagePaths([file.path]) : handleTrackPaths([file.path]))
            }
            onMoveFile={(file, sourceSectionId, targetSectionId) => {
              if (isCommitChangesMode) {
                return;
              }

              if (sourceSectionId === targetSectionId) {
                return;
              }

              if (targetSectionId === "staged") {
                void handleTrackPaths([file.path]);
                return;
              }

              if (sourceSectionId === "staged") {
                void handleUnstagePaths([file.path]);
              }
            }}
            onMoveFiles={(files, sourceSectionId, targetSectionId) => {
              if (isCommitChangesMode) {
                return;
              }

              if (sourceSectionId === targetSectionId || files.length === 0) {
                return;
              }

              const relativePaths = files.map((file) => file.path);
              if (targetSectionId === "staged") {
                void handleTrackPaths(relativePaths);
                return;
              }

              if (sourceSectionId === "staged") {
                void handleUnstagePaths(relativePaths);
              }
            }}
            onRevertFile={isCommitChangesMode ? undefined : (file) => void handleRevertPaths([file.path])}
            onCopyFilePath={async (file) => {
              if (!selectedWorkspaceWorktreePath || !navigator.clipboard) {
                return;
              }

              try {
                await navigator.clipboard.writeText(
                  resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, file.path),
                );
              } catch (error) {
                console.error("Failed to copy workspace file path", error);
              }
            }}
            onCopyRelativeFilePath={async (file) => {
              if (!navigator.clipboard) {
                return;
              }

              try {
                await navigator.clipboard.writeText(file.path);
              } catch (error) {
                console.error("Failed to copy workspace relative file path", error);
              }
            }}
            onSelectFile={async (file) => {
              if (isCommitChangesMode) {
                const commitHashForSelection =
                  selectedComparison !== "uncommitted" && selectedComparison !== "all" ? selectedComparison : undefined;
                const targetBranchForAllSelection =
                  selectedComparison === "all" ? selectedWorkspaceSourceBranch : undefined;
                await handleSelectCommitChangedFile(file.path, commitHashForSelection, targetBranchForAllSelection);
                return;
              }

              if (!selectedWorkspaceWorktreePath) {
                return;
              }

              const normalizedPath = normalizeWorkspaceRelativePath(file.path);
              if (!normalizedPath) {
                return;
              }

              try {
                const response = await readDiff({
                  workspaceWorktreePath: selectedWorkspaceWorktreePath,
                  relativePath: normalizedPath,
                });

                openTab({
                  workspaceId: selectedWorkspaceId,
                  kind: "diff",
                  path: normalizedPath,
                  changeKind: file.kind,
                  additions: file.additions,
                  deletions: file.deletions,
                  oldContent: response.oldContent,
                  newContent: response.newContent,
                });
              } catch (error) {
                console.error("Failed to load workspace workspace diff", error);
                openTab({
                  workspaceId: selectedWorkspaceId,
                  kind: "diff",
                  path: normalizedPath,
                  changeKind: file.kind,
                  additions: file.additions,
                  deletions: file.deletions,
                });
              }
            }}
          />
        </>
      )}
    </Box>
  );
}
