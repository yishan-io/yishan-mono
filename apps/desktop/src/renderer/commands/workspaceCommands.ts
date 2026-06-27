import type { ExternalAppId } from "../../shared/contracts/externalApps";
import { filterVisibleProjects } from "../helpers/projectHelpers";
import {
  computeUniqueGitChangeFileCount,
  countWorkspaceGitChanges,
  normalizeCreateWorkspaceInput,
  summarizeReconciledWorkspaceGitChangeTotals,
} from "../helpers/workspaceHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { layoutStore } from "../store/settings/layoutStore";
import { workspaceStore } from "../store/workspaceStore";
import { DEFAULT_RIGHT_PANE_TAB, type WorkspaceRightPaneTab, workspaceUiStore } from "../store/workspaceUiStore";
import { closeWorkspacesForProjects, warmupWorkspacesForProjects } from "./workspaceWarmupCommand";

export { createWorkspace } from "./workspaceCreateCommand";
export { closeWorkspace } from "./workspaceCloseCommand";
import { readWorkspaceStoreState } from "./workspaceStoreHelpers";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

export const OPEN_CREATE_WORKSPACE_DIALOG_EVENT = "workspace:open-create-workspace-dialog";

type OpenCreateWorkspaceDialogDetail = {
  projectId: string;
  repoId?: string;
};

/**
 * Resolves the normalized target branch (origin-prefixed) for a workspace,
 * matching the convention used by the Changes tab comparison.
 */
function resolveWorkspaceTargetBranch(workspaceId: string): string | undefined {
  const workspace = readWorkspaceStoreState().workspaces.find((ws) => ws.id === workspaceId);
  const sourceBranch = workspace?.sourceBranch?.trim();
  if (!sourceBranch) {
    return undefined;
  }
  if (sourceBranch.startsWith("origin/") || sourceBranch.includes("/")) {
    return sourceBranch;
  }
  return `origin/${sourceBranch}`;
}

/** Loads workspace git change sections and stores the aggregated count.
 *
 * The count combines:
 * 1. Uncommitted working-tree changes (staged + unstaged + untracked file count).
 * 2. Committed branch-diff changes against the workspace's source branch
 *    (files changed between merge-base and HEAD).
 *
 * The two sets are merged by unique file path so a file that appears in both
 * the branch diff and the working tree is only counted once.
 *
 * The totals (additions/deletions) similarly combine both sources.
 */
export async function refreshWorkspaceGitChanges(workspaceId: string): Promise<void> {
  if (!workspaceId) {
    return;
  }

  const store = readWorkspaceStoreState();
  const workspace = store.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!workspace) {
    return;
  }

  if (workspace.state && workspace.state !== "active") {
    return;
  }

  const workspaceWorktreePath = workspace.worktreePath?.trim();
  if (!workspaceWorktreePath) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const targetBranch = resolveWorkspaceTargetBranch(workspaceId);

    // Fetch uncommitted changes and (optionally) branch diff summary in parallel.
    const [sections, branchSummary] = await Promise.all([
      client.git.listChanges({ workspaceId }),
      targetBranch
        ? client.git.getBranchDiffSummary({ workspaceId, targetBranch }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const uncommittedCount = countWorkspaceGitChanges(sections);
    const uncommittedTotals = summarizeReconciledWorkspaceGitChangeTotals(sections);

    if (!branchSummary) {
      // No source branch configured — fall back to uncommitted-only count.
      readWorkspaceStoreState().setWorkspaceGitChangesCount(workspaceId, uncommittedCount);
      readWorkspaceStoreState().setWorkspaceGitChangeTotals(workspaceId, uncommittedTotals);
      return;
    }

    const combinedCount = computeUniqueGitChangeFileCount(branchSummary.files ?? [], sections);
    const combinedTotals = {
      additions: branchSummary.additions + uncommittedTotals.additions,
      deletions: branchSummary.deletions + uncommittedTotals.deletions,
    };

    readWorkspaceStoreState().setWorkspaceGitChangesCount(workspaceId, combinedCount);
    readWorkspaceStoreState().setWorkspaceGitChangeTotals(workspaceId, combinedTotals);
  } catch (error) {
    console.error("Failed to refresh workspace git changes", error);
  }
}

/** Re-queries the daemon for the selected workspace pull request state. */
export async function refreshWorkspacePullRequest(workspaceId: string): Promise<void> {
  if (!workspaceId) {
    return;
  }

  const workspace = readWorkspaceStoreState().workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const refreshedWorkspace = await client.workspace.refreshPullRequest({
      workspaceId,
    });

    readWorkspaceStoreState().setWorkspacePullRequest(workspaceId, refreshedWorkspace.pullRequest);
  } catch (error) {
    console.error("Failed to refresh workspace pull request", error);
    throw error;
  }
}

/** Stores visible repo ids for left-pane pinning state and triggers daemon warmup/close. */
export function setDisplayRepoIds(repoIds: string[]) {
  const previousDisplayIds = readWorkspaceStoreState().displayProjectIds;
  readWorkspaceStoreState().setDisplayProjectIds(repoIds);

  const repoIdSet = new Set(repoIds);
  const prevSet = new Set(previousDisplayIds);

  const addedIds = repoIds.filter((id) => !prevSet.has(id));
  const removedIds = previousDisplayIds.filter((id) => !repoIdSet.has(id));

  if (addedIds.length > 0) {
    void warmupWorkspacesForProjects(addedIds);
  }
  if (removedIds.length > 0) {
    void closeWorkspacesForProjects(removedIds);
  }
}

/** Stores last used external app id for quick-open actions. */
export function setLastUsedExternalAppId(appId: ExternalAppId) {
  readWorkspaceStoreState().setLastUsedExternalAppId(appId);
}

/** Sets left pane width in workspace layout state. */
export function setLeftPaneWidth(width: number) {
  layoutStore.getState().setLeftPaneWidth(width);
}

/** Sets right pane width in workspace layout state. */
export function setRightPaneWidth(width: number) {
  layoutStore.getState().setRightPaneWidth(width);
}

/** Toggles left workspace pane manual visibility state. */
export function toggleLeftPaneVisibility() {
  const state = layoutStore.getState();
  state.setIsLeftPaneManuallyHidden(!state.isLeftPaneManuallyHidden);
}

/** Toggles right workspace pane manual visibility state for the selected workspace. */
export function toggleRightPaneVisibility() {
  const workspaceId = readWorkspaceStoreState().selectedWorkspaceId;
  const uiState = workspaceUiStore.getState();
  const isHidden = uiState.isRightPaneHiddenByWorkspaceId[workspaceId] ?? true;
  uiState.setIsRightPaneHidden(workspaceId, !isHidden);
}

/** Toggles a workspace pane: opens and switches to it, or collapses if already active. */
export function activateWorkspacePane(pane: "repo" | WorkspaceRightPaneTab) {
  if (pane === "repo") {
    const state = layoutStore.getState();
    state.setIsLeftPaneManuallyHidden(!state.isLeftPaneManuallyHidden);
    return;
  }

  const workspaceId = readWorkspaceStoreState().selectedWorkspaceId;
  const uiState = workspaceUiStore.getState();
  const currentTab = uiState.rightPaneTabByWorkspaceId[workspaceId] ?? DEFAULT_RIGHT_PANE_TAB;
  const isHidden = uiState.isRightPaneHiddenByWorkspaceId[workspaceId] ?? true;

  if (!isHidden && currentTab === pane) {
    uiState.setIsRightPaneHidden(workspaceId, true);
  } else {
    uiState.setIsRightPaneHidden(workspaceId, false);
    uiState.setRightPaneTab(workspaceId, pane);
  }
}

/** Requests opening the create-workspace dialog for the currently selected project context. */
export function openCreateWorkspaceDialog() {
  if (typeof window === "undefined") {
    return;
  }

  const state = readWorkspaceStoreState();
  const selectedProjectId = state.selectedProjectId.trim();
  const selectedWorkspaceProjectId = state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspaceId,
  )?.projectId;
  const selectedWorkspaceRepoId = state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspaceId,
  )?.repoId;
  const fallbackProjectId = filterVisibleProjects(state.projects, state.displayProjectIds)[0]?.id;
  const projectId = selectedProjectId || selectedWorkspaceProjectId || selectedWorkspaceRepoId || fallbackProjectId;

  if (!projectId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenCreateWorkspaceDialogDetail>(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, {
      detail: { projectId, repoId: projectId },
    }),
  );
}

/** Focuses the repo file-tree area after making the files pane visible. */
export function focusWorkspaceFileTree() {
  activateWorkspacePane("files");

  if (typeof document === "undefined") {
    return;
  }

  const focusFileTreeArea = () => {
    if (typeof document === "undefined") {
      return false;
    }

    const fileTreeArea = document.querySelector<HTMLElement>('[data-testid="repo-file-tree-area"]');
    if (!fileTreeArea) {
      return false;
    }

    const activeTreeItem = fileTreeArea.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    if (activeTreeItem) {
      activeTreeItem.focus();
      return true;
    }

    fileTreeArea.focus();
    return true;
  };

  focusFileTreeArea();
  requestAnimationFrame(() => {
    focusFileTreeArea();
  });
  setTimeout(() => {
    focusFileTreeArea();
  }, 16);
}

/** Opens workspace file search without changing file-tree pane visibility state. */
export function openWorkspaceFileSearch() {
  workspaceUiStore.getState().requestFileSearch();
}

/** Requests deletion of the currently selected file-tree entry. */
export function deleteSelectedFileTreeEntry() {
  workspaceUiStore.getState().requestDeleteSelection();
}

/** Requests undo of the latest file-tree operation. */
export function undoFileTreeOperation() {
  workspaceUiStore.getState().requestUndo();
}

/** Renames one workspace in renderer store state. */
export function renameWorkspace(input: { projectId?: string; repoId?: string; workspaceId: string; name: string }) {
  const projectId = input.projectId ?? input.repoId ?? "";
  if (!projectId) {
    return;
  }

  if (input.projectId) {
    readWorkspaceStoreState().renameWorkspace({
      ...input,
      projectId,
      repoId: projectId,
    });
    return;
  }

  readWorkspaceStoreState().renameWorkspace({
    repoId: projectId,
    workspaceId: input.workspaceId,
    name: input.name,
  });
}

/** Reorders one workspace in the left-pane workspace list. */
export function reorderWorkspace(input: {
  draggedWorkspaceId: string;
  targetWorkspaceId: string;
  position: "before" | "after";
}) {
  if (!input.draggedWorkspaceId || !input.targetWorkspaceId || input.draggedWorkspaceId === input.targetWorkspaceId) {
    return;
  }

  readWorkspaceStoreState().reorderWorkspace(input);
}

/** Renames one managed workspace branch in git and mirrors the new branch in renderer store state. */
export async function renameWorkspaceBranch(input: {
  projectId?: string;
  repoId?: string;
  workspaceId: string;
  branch: string;
}) {
  const normalizedBranch = input.branch.trim();
  const projectId = input.projectId ?? input.repoId ?? "";
  if (!projectId || !input.workspaceId || !normalizedBranch) {
    return;
  }

  const store = readWorkspaceStoreState();
  const workspace = store.workspaces.find(
    (item) => item.id === input.workspaceId && (item.projectId ?? item.repoId) === projectId && item.kind !== "local",
  );
  if (!workspace) {
    return;
  }

  const workspaceWorktreePath = workspace.worktreePath?.trim();
  if (!workspaceWorktreePath || workspace.branch === normalizedBranch) {
    return;
  }

  try {
    const client = await getDaemonClient();
    await client.git.renameBranch({
      workspaceId: input.workspaceId,
      nextBranch: normalizedBranch,
    });
    store.renameWorkspaceBranch({
      repoId: projectId,
      workspaceId: input.workspaceId,
      branch: normalizedBranch,
    });
  } catch (error) {
    console.error("Failed to rename workspace branch", error);
    throw error;
  }
}

export async function repairWorkspace(workspaceId: string): Promise<void> {
  try {
    const client = await getDaemonClient();
    const result = await client.workspace.repair({ workspaceId });
    const store = readWorkspaceStoreState();
    const workspace = store.workspaces.find((item) => item.id === workspaceId);
    if (workspace && result.state === "active") {
      await refreshWorkspaceGitChanges(workspaceId);
    }
  } catch (error) {
    console.error("Failed to repair workspace", error);
    throw error;
  }
}

export async function forgetWorkspace(workspaceId: string): Promise<void> {
  try {
    const client = await getDaemonClient();
    await client.workspace.forget({ workspaceId });
    const store = readWorkspaceStoreState();
    const previousWorkspaces = store.workspaces;
    const workspace = store.workspaces.find((item) => item.id === workspaceId);
    if (workspace) {
      const projectId = workspace.projectId ?? workspace.repoId;
      workspaceStore.getState().removeWorkspace({ repoId: projectId, workspaceId });
    }
    syncTabStoreWithWorkspace(previousWorkspaces);
  } catch (error) {
    console.error("Failed to forget workspace", error);
    throw error;
  }
}
