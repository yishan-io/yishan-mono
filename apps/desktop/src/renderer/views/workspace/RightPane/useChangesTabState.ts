import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectCommitComparisonCommit,
  ProjectCommitComparisonData,
  ProjectCommitComparisonFile,
  ProjectCommitComparisonSelection,
} from "../../../components/ProjectCommitComparison";
import type { ProjectGitChangeKind, ProjectGitChangesSection } from "../../../components/ProjectGitChangesList";
import { useCommands } from "../../../hooks/useCommands";
import { workspaceStore } from "../../../store/workspaceStore";
import {
  type RepoChangesBySection,
  buildAllCommitChangesSection,
  buildCommitChangesSection,
  createEmptyRepoChangesBySection,
  createEmptyRepoCommitComparison,
  dedupeRepoChangeFiles,
  normalizeProjectGitChangeKind,
  normalizeWorkspaceRelativePath,
  reconcileRenameLikePairs,
  toCommitFile,
} from "./changesTabHelpers";

export { normalizeWorkspaceRelativePath } from "./changesTabHelpers";

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
          workspaceId: selectedWorkspaceId,
          targetBranch,
        });
        if (commitComparisonRequestIdRef.current === requestId) {
          // Normalize wire response: old daemons send string[] for allChangedFiles
          // and changedFiles; new daemons send GitCommitFile[].
          const normalized: ProjectCommitComparisonData = {
            ...commitComparison,
            allChangedFiles: (commitComparison.allChangedFiles as unknown[]).map(toCommitFile),
            commits: commitComparison.commits.map((c) => ({
              ...c,
              changedFiles: (c.changedFiles as unknown[]).map(toCommitFile),
            })),
          };
          setRepoCommitComparison(normalized);
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
    [listGitCommitsToTarget, selectedWorkspaceId, selectedWorkspaceWorktreePath],
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
      const response = await listGitChanges({ workspaceId: selectedWorkspaceId });
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
  }, [
    listGitChanges,
    loadCommitComparison,
    selectedWorkspaceId,
    selectedWorkspaceSourceBranch,
    selectedWorkspaceWorktreePath,
  ]);

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
    void selectedWorkspaceSourceBranch;
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
    const seen = new Map<string, ProjectCommitComparisonFile>();
    for (const f of repoCommitComparison.allChangedFiles) {
      const norm = normalizeWorkspaceRelativePath(f.path);
      if (norm) seen.set(norm, { ...f, path: norm });
    }
    for (const section of [
      repoChangesBySection.staged,
      repoChangesBySection.unstaged,
      repoChangesBySection.untracked,
    ]) {
      for (const file of section) {
        const norm = normalizeWorkspaceRelativePath(file.path);
        if (norm && !seen.has(norm)) {
          seen.set(norm, { path: norm, status: "M" });
        }
      }
    }
    return [...seen.values()];
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
