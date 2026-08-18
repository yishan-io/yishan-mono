import {
  requestDeleteSelection,
  requestFileSearch,
  requestSelectFolderInFileTree,
  requestUndo,
} from "@renderer/domains/files";
import { supportsGitFeatures } from "@renderer/domains/project";
import { filterVisibleProjects } from "@renderer/domains/project";
import {
  setDisplayProjectIds as applyDisplayProjectIds,
  setLastUsedExternalAppId as applyLastUsedExternalAppId,
} from "@renderer/domains/project";
import { selectProjectById, selectProjectDisplayIds, selectProjects } from "@renderer/domains/project";
import {
  DEFAULT_RIGHT_PANE_TAB,
  type WorkspaceRightPaneTab,
  layoutStore,
  setIsRightPaneHidden,
  setLeftPaneHidden,
  setRightPaneTab,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { isFolderWorkspace } from "../model/localFolder";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { normalizeCreateWorkspaceInput } from "../state/workspaceStoreMutations";
import { closeWorkspacesForProjects, warmupWorkspacesForProjects } from "./workspaceWarmupCommand";

export { createWorkspace } from "./workspaceCreateCommand";
export { closeWorkspace } from "./workspaceCloseCommand";
import { syncTabStoreWithWorkspace } from "../../../domains/workspace/commands/workspaceTabSync";
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

/** Toggles left workspace pane manual visibility state. */
export function toggleLeftPaneVisibility() {
  setLeftPaneHidden(!layoutStore.getState().isLeftPaneManuallyHidden);
}

/** Toggles right workspace pane manual visibility state for the selected workspace. */
export function toggleRightPaneVisibility() {
  const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  const isHidden = layoutStore.getState().isRightPaneHiddenByWorkspaceId[workspaceId] ?? true;
  setIsRightPaneHidden(workspaceId, !isHidden);
}

/** Toggles a workspace pane: opens and switches to it, or collapses if already active. */
export function activateWorkspacePane(pane: "repo" | WorkspaceRightPaneTab) {
  if (pane === "repo") {
    setLeftPaneHidden(!layoutStore.getState().isLeftPaneManuallyHidden);
    return;
  }

  const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  // Folder workspaces have no git state: never open git tabs for them.
  const workspace = workspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
  if ((pane === "changes" || pane === "pr") && isFolderWorkspace(workspace)) {
    return;
  }

  const currentTab = layoutStore.getState().rightPaneTabByWorkspaceId[workspaceId] ?? DEFAULT_RIGHT_PANE_TAB;
  const isHidden = layoutStore.getState().isRightPaneHiddenByWorkspaceId[workspaceId] ?? true;

  if (!isHidden && currentTab === pane) {
    setIsRightPaneHidden(workspaceId, true);
  } else {
    setIsRightPaneHidden(workspaceId, false);
    setRightPaneTab(workspaceId, pane);
  }
}

/** Requests opening the create-workspace dialog for the currently selected project context. */
export function openCreateWorkspaceDialog() {
  if (typeof window === "undefined") {
    return;
  }

  const state = workspaceStore.getState();
  const selectedWorkspace = state.workspaces.find(
    (workspace) => workspace.id === workbenchNavigationStore.getState().activeWorkspaceId,
  );
  // Folder workspaces have no worktrees: never surface the create dialog.
  if (isFolderWorkspace(selectedWorkspace)) {
    return;
  }
  const selectedProjectId = workbenchNavigationStore.getState().activeProjectId.trim();
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
  requestFileSearch();
}

/** Requests selecting a folder path in the file tree and ensures the files tab is visible. */
export function selectFolderInFileTree(path: string) {
  const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  setIsRightPaneHidden(workspaceId, false);
  setRightPaneTab(workspaceId, "files");
  requestSelectFolderInFileTree(path);
}

/** Requests deletion of the currently selected file-tree entry. */
export function deleteSelectedFileTreeEntry() {
  requestDeleteSelection();
}

/** Requests undo of the latest file-tree operation. */
export function undoFileTreeOperation() {
  requestUndo();
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
