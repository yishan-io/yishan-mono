import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import { api } from "../../../api";
import {
  setIsLeftPaneManuallyHidden as applyIsLeftPaneManuallyHidden,
  setLeftPaneWidth as applyLeftPaneWidth,
  setRightPaneWidth as applyRightPaneWidth,
} from "../../../features/workbench/state/workbenchActions";
import { selectIsLeftPaneManuallyHidden } from "../../../features/workbench/state/workbenchSelectors";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import {
  DEFAULT_RIGHT_PANE_TAB,
  type WorkspaceRightPaneTab,
  workspaceUiStore,
} from "../../../features/workspace/state/workspaceUiStore";
import { isWorkspaceNotFoundError } from "../../../helpers/errorHelpers";
import { isFolderWorkspace } from "../../../helpers/localFolder";
import { supportsGitFeatures } from "../../../helpers/projectGitCapability";
import { filterVisibleProjects } from "../../../helpers/projectHelpers";
import {
  computeUniqueGitChangeFileCount,
  countWorkspaceGitChanges,
  normalizeCreateWorkspaceInput,
  summarizeReconciledWorkspaceGitChangeTotals,
} from "../../../helpers/workspaceHelpers";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import {
  setDisplayProjectIds as applyDisplayProjectIds,
  setLastUsedExternalAppId as applyLastUsedExternalAppId,
} from "../../project/state/projectActions";
import { selectProjectById, selectProjectDisplayIds, selectProjects } from "../../project/state/projectSelectors";
import { workspaceProjectionStore } from "../state/workspaceProjectionStore";
import { closeWorkspacesForProjects, warmupWorkspacesForProjects } from "./workspaceWarmupCommand";

export { createWorkspace } from "./workspaceCreateCommand";
export { closeWorkspace } from "./workspaceCloseCommand";
import { syncTabStoreWithWorkspace } from "../../../features/workbench/commands/workspaceTabSync";
export { deleteLocalFolder } from "./localFolderCommands";

export const OPEN_CREATE_WORKSPACE_DIALOG_EVENT = "workspace:open-create-workspace-dialog";

type OpenCreateWorkspaceDialogDetail = {
  projectId: string;
  repoId?: string;
};

/**
 * Subscribes one listener to create-workspace dialog open requests. Returns
 * a teardown. The event is dispatched by `openCreateWorkspaceDialog` (the
 * application command) and consumed by the LeftPane view; keeping the
 * request/subscribe pair on the command surface avoids a raw window-event
 * contract between features.
 */
export function subscribeOpenCreateWorkspaceDialog(
  listener: (detail: OpenCreateWorkspaceDialogDetail) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<OpenCreateWorkspaceDialogDetail>;
    const projectId = customEvent.detail?.projectId?.trim() ?? customEvent.detail?.repoId?.trim();
    if (!projectId) {
      return;
    }
    listener({ projectId, repoId: projectId });
  };
  window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleEvent);
  return () => {
    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleEvent);
  };
}

/**
 * Resolves the normalized target branch (origin-prefixed) for a workspace,
 * matching the convention used by the Changes tab comparison.
 */
function resolveWorkspaceTargetBranch(workspaceId: string): string | undefined {
  const workspace = workspaceStore.getState().workspaces.find((ws) => ws.id === workspaceId);
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

  const store = workspaceStore.getState();
  const workspace = store.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!workspace) {
    return;
  }

  // Folder workspaces (kind="folder"/sentinel project id) and non-git
  // projects have no git state to poll.
  if (isFolderWorkspace(workspace)) {
    return;
  }
  const project = selectProjectById(workspace.projectId ?? workspace.repoId);
  if (!supportsGitFeatures(project?.sourceType)) {
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
      workspaceProjectionStore.getState().setWorkspaceGitChangesCount(workspaceId, uncommittedCount);
      workspaceProjectionStore.getState().setWorkspaceGitChangeTotals(workspaceId, uncommittedTotals);
      return;
    }

    const combinedCount = computeUniqueGitChangeFileCount(branchSummary.files ?? [], sections);
    const combinedTotals = {
      additions: branchSummary.additions + uncommittedTotals.additions,
      deletions: branchSummary.deletions + uncommittedTotals.deletions,
    };

    workspaceProjectionStore.getState().setWorkspaceGitChangesCount(workspaceId, combinedCount);
    workspaceProjectionStore.getState().setWorkspaceGitChangeTotals(workspaceId, combinedTotals);
  } catch (error) {
    if (isWorkspaceNotFoundError(error)) {
      return;
    }
    console.error("Failed to refresh workspace git changes", error);
  }
}

/** Re-queries the daemon for the selected workspace pull request state. */
export async function refreshWorkspacePullRequest(workspaceId: string): Promise<void> {
  if (!workspaceId) {
    return;
  }

  const workspace = workspaceStore.getState().workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    return;
  }

  // Folder workspaces have no git state nor pull requests: never query the daemon.
  if (isFolderWorkspace(workspace)) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const refreshedWorkspace = await client.workspace.refreshPullRequest({
      workspaceId,
    });

    workspaceProjectionStore.getState().setWorkspacePullRequest(workspaceId, refreshedWorkspace.pullRequest);
  } catch (error) {
    console.error("Failed to refresh workspace pull request", error);
    throw error;
  }
}

/** Lists historical pull request records for one workspace from the API service. */
export async function listPullRequestHistory(orgId: string, projectId: string, workspaceId: string) {
  return api.workspacePullRequest.list(orgId, projectId, workspaceId);
}

/** Stores visible repo ids for left-pane pinning state and triggers daemon warmup/close. */
export function setDisplayRepoIds(repoIds: string[]) {
  const previousDisplayIds = selectProjectDisplayIds();
  applyDisplayProjectIds(repoIds);

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
  applyLastUsedExternalAppId(appId);
}

/** Sets left pane width in workspace layout state. */
export function setLeftPaneWidth(width: number) {
  applyLeftPaneWidth(width);
}

/** Sets right pane width in workspace layout state. */
export function setRightPaneWidth(width: number) {
  applyRightPaneWidth(width);
}

/** Toggles left workspace pane manual visibility state. */
export function toggleLeftPaneVisibility() {
  applyIsLeftPaneManuallyHidden(!selectIsLeftPaneManuallyHidden());
}

/** Toggles right workspace pane manual visibility state for the selected workspace. */
export function toggleRightPaneVisibility() {
  const workspaceId = workspaceStore.getState().selectedWorkspaceId;
  const uiState = workspaceUiStore.getState();
  const isHidden = uiState.isRightPaneHiddenByWorkspaceId[workspaceId] ?? true;
  uiState.setIsRightPaneHidden(workspaceId, !isHidden);
}

/** Toggles a workspace pane: opens and switches to it, or collapses if already active. */
export function activateWorkspacePane(pane: "repo" | WorkspaceRightPaneTab) {
  if (pane === "repo") {
    applyIsLeftPaneManuallyHidden(!selectIsLeftPaneManuallyHidden());
    return;
  }

  const workspaceId = workspaceStore.getState().selectedWorkspaceId;
  // Folder workspaces have no git state: never open git tabs for them.
  const workspace = workspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
  if ((pane === "changes" || pane === "pr") && isFolderWorkspace(workspace)) {
    return;
  }

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

  const state = workspaceStore.getState();
  const selectedWorkspace = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
  // Folder workspaces have no worktrees: never surface the create dialog.
  if (isFolderWorkspace(selectedWorkspace)) {
    return;
  }
  const selectedProjectId = state.selectedProjectId.trim();
  const selectedWorkspaceProjectId = selectedWorkspace?.projectId;
  const selectedWorkspaceRepoId = selectedWorkspace?.repoId;
  const fallbackProjectId = filterVisibleProjects(selectProjects(), selectProjectDisplayIds())[0]?.id;
  const projectId = selectedProjectId || selectedWorkspaceProjectId || selectedWorkspaceRepoId || fallbackProjectId;

  if (!projectId) {
    return;
  }

  // Non-git projects have no worktrees: never surface the create dialog.
  const project = selectProjectById(projectId);
  if (!supportsGitFeatures(project?.sourceType)) {
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

/** Requests selecting a folder path in the file tree and ensures the files tab is visible. */
export function selectFolderInFileTree(path: string) {
  const workspaceId = workspaceStore.getState().selectedWorkspaceId;
  workspaceUiStore.getState().setIsRightPaneHidden(workspaceId, false);
  workspaceUiStore.getState().setRightPaneTab(workspaceId, "files");
  workspaceUiStore.getState().requestSelectFolderInFileTree(path);
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
    workspaceStore.getState().renameWorkspace({
      ...input,
      projectId,
      repoId: projectId,
    });
    return;
  }

  workspaceStore.getState().renameWorkspace({
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

  workspaceStore.getState().reorderWorkspace(input);
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

  const store = workspaceStore.getState();
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
