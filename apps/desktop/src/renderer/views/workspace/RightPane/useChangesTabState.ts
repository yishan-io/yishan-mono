import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectCommitComparisonCommit,
  ProjectCommitComparisonData,
  ProjectCommitComparisonFile,
  ProjectCommitComparisonSelection,
} from "../../../components/ProjectCommitComparison";
import type { ProjectGitChangeKind, ProjectGitChangesSection } from "../../../components/ProjectGitChangesList";
import { projectStore } from "../../../features/project/model/projectStore";
import { isWorkspaceNotFoundError } from "../../../helpers/errorHelpers";
import { isFolderWorkspace } from "../../../helpers/localFolder";
import { supportsGitFeatures } from "../../../helpers/projectGitCapability";
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

const GIT_CHANGES_REFRESH_RETRY_MS = 5_000;
const MAX_GIT_CHANGES_REFRESH_RETRIES = 3;

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
  const retryRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveRefreshRetriesRef = useRef(0);
  const loadedWorkspaceRequestKeyRef = useRef<string | null>(null);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const selectedWorkspace = workspaceStore((state) =>
    state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId),
  );
  const selectedWorkspaceWorktreePath = selectedWorkspace?.worktreePath;
  const selectedWorkspaceSourceBranch = workspaceStore((state) => {
    const workspace = state.workspaces.find((w) => w.id === state.selectedWorkspaceId);
    const project = (projectStore.getState().projects ?? []).find(
      (p) => p.id === (workspace?.projectId ?? workspace?.repoId),
    );
    // Folder workspaces and non-git projects have no branches: no source
    // branch means the commit comparison path never fires daemon git RPCs
    // from this mounted tab.
    if (isFolderWorkspace(workspace) || !supportsGitFeatures(project?.sourceType)) {
      return "";
    }
    const raw = workspace?.sourceBranch?.trim() || project?.defaultBranch?.trim() || "main";
    return raw.includes("/") ? raw : `origin/${raw}`;
  });
  const workspaceGitRefreshVersion = workspaceStore((state) => {
    if (!selectedWorkspaceWorktreePath) {
      return 0;
    }
    return state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0;
  });
  const selectedWorkspaceRequestKey = `${selectedWorkspaceId}:${selectedWorkspaceWorktreePath ?? ""}:${selectedWorkspaceSourceBranch}`;
  const selectedWorkspaceRequestKeyRef = useRef(selectedWorkspaceRequestKey);
  selectedWorkspaceRequestKeyRef.current = selectedWorkspaceRequestKey;
  const { listGitChanges, listGitCommitsToTarget } = useCommands();

  const loadCommitComparison = useCallback(
    async (targetBranch: string, showProgress = false, canApply: () => boolean = () => true) => {
      if (!canApply()) {
        return;
      }
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
        if (commitComparisonRequestIdRef.current === requestId && canApply()) {
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
        if (commitComparisonRequestIdRef.current === requestId && canApply()) {
          setRepoCommitComparison(createEmptyRepoCommitComparison());
          console.error("Failed to load workspace commit comparison", error);
        }
      } finally {
        if (showProgress && commitComparisonRequestIdRef.current === requestId && canApply()) {
          setIsCommitComparisonLoading(false);
        }
      }
    },
    [listGitCommitsToTarget, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const refreshChangesRef = useRef<() => Promise<void>>(async () => {});

  const refreshChanges = useCallback(async () => {
    // A fresh attempt supersedes any pending retry.
    if (retryRefreshTimerRef.current) {
      clearTimeout(retryRefreshTimerRef.current);
      retryRefreshTimerRef.current = null;
    }
    const requestId = repoChangesLoadRequestIdRef.current + 1;
    repoChangesLoadRequestIdRef.current = requestId;
    const shouldShowLoadingForRequest =
      Boolean(selectedWorkspaceWorktreePath) &&
      pendingWorkspaceSwitchLoadPathRef.current === selectedWorkspaceWorktreePath;
    const isCurrentRequest = () =>
      repoChangesLoadRequestIdRef.current === requestId &&
      selectedWorkspaceRequestKeyRef.current === selectedWorkspaceRequestKey;

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
      if (!isCurrentRequest()) {
        return;
      }
      loadedWorkspaceRequestKeyRef.current = selectedWorkspaceRequestKey;
      consecutiveRefreshRetriesRef.current = 0;
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
      if (shouldShowLoadingForRequest && isCurrentRequest()) {
        pendingWorkspaceSwitchLoadPathRef.current = null;
        setIsRepoChangesLoading(false);
      }
      if (!selectedWorkspaceSourceBranch) {
        setRepoCommitComparison(createEmptyRepoCommitComparison());
        return;
      }
      await loadCommitComparison(selectedWorkspaceSourceBranch, false, isCurrentRequest);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      // Transient git failures (for example index.lock while an agent runs git
      // operations) must not wipe the previously loaded list. Preserve it when
      // the workspace did not change; only clear when the workspace switched so
      // another workspace's files never leak in. Schedule a bounded retry so a
      // refresh that raced a busy git index self-heals.
      if (loadedWorkspaceRequestKeyRef.current !== selectedWorkspaceRequestKey) {
        setRepoChangesBySection(createEmptyRepoChangesBySection());
        setRepoCommitComparison(createEmptyRepoCommitComparison());
      }
      if (shouldShowLoadingForRequest && isCurrentRequest()) {
        pendingWorkspaceSwitchLoadPathRef.current = null;
        setIsRepoChangesLoading(false);
      }
      if (!isWorkspaceNotFoundError(error)) {
        console.error("Failed to load workspace git changes", error);
        if (consecutiveRefreshRetriesRef.current < MAX_GIT_CHANGES_REFRESH_RETRIES) {
          consecutiveRefreshRetriesRef.current += 1;
          if (retryRefreshTimerRef.current) {
            clearTimeout(retryRefreshTimerRef.current);
          }
          retryRefreshTimerRef.current = setTimeout(() => {
            retryRefreshTimerRef.current = null;
            void refreshChangesRef.current();
          }, GIT_CHANGES_REFRESH_RETRY_MS);
        }
      }
    }
  }, [
    listGitChanges,
    loadCommitComparison,
    selectedWorkspaceId,
    selectedWorkspaceRequestKey,
    selectedWorkspaceSourceBranch,
    selectedWorkspaceWorktreePath,
  ]);
  refreshChangesRef.current = refreshChanges;

  useEffect(() => {
    if (!selectedWorkspaceWorktreePath) {
      pendingWorkspaceSwitchLoadPathRef.current = null;
      setIsRepoChangesLoading(false);
      return;
    }
    if (retryRefreshTimerRef.current) {
      clearTimeout(retryRefreshTimerRef.current);
      retryRefreshTimerRef.current = null;
    }
    pendingWorkspaceSwitchLoadPathRef.current = selectedWorkspaceWorktreePath;
    consecutiveRefreshRetriesRef.current = 0;
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

  useEffect(() => {
    return () => {
      if (retryRefreshTimerRef.current) {
        clearTimeout(retryRefreshTimerRef.current);
        retryRefreshTimerRef.current = null;
      }
    };
  }, []);

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
