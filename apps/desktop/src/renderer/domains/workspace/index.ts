/**
 * Workspace feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, workspace models, and the public State
 * surfaces (selectors + actions). The Workspace Stores are internal.
 */
export type { WorkspaceCommands } from "./commands/contract";
export type {
  WorkspaceGitChangeTotals,
  WorkspaceHealth,
  WorkspaceItem,
  WorkspaceLifecycleState,
  WorkspaceStatus,
} from "./model/workspaceTypes";
export { selectWorkspaces } from "./state/workspaceSelectors";
export { workspaceStore, type WorkspaceStoreState } from "./state/workspaceStore";
export {
  activateWorkspacePane,
  closeWorkspace,
  createWorkspace,
  deleteLocalFolder,
  deleteSelectedFileTreeEntry,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  renameWorkspace,
  renameWorkspaceBranch,
  reorderWorkspace,
  setDisplayRepoIds,
  setLastUsedExternalAppId,
  selectFolderInFileTree,
  subscribeOpenCreateWorkspaceDialog,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
} from "./commands/workspaceCommands";
export {
  createLocalFolderImport,
  openFoldersForSnapshot,
  restoreFolderSelectionIfNeeded,
} from "./commands/localFolderCommands";
export {
  buildWorkspaceOpenProjectEntries,
  openWorkspaceEntries,
  warmupWorkspacesForProjects,
} from "./commands/workspaceWarmupCommand";
export { syncTabStoreWithWorkspace } from "./commands/workspaceTabSync";
export { resolveWorkspaceIdForProject, resolveWorkspaceProjectId } from "./model/workspaceTypes";
export {
  reconcileWorkspaceSnapshot,
  type SnapshotReconcilerInput,
  type SnapshotReconcilerResult,
} from "./model/snapshotReconciler";
export {
  addWorkspace,
  setOrderedWorkspaceIds,
} from "./state/workspaceActions";
export {
  workspaceCreateProgressStore,
  type WorkspaceCreateProgressEntry,
  type WorkspaceCreateProgressStep,
  type WorkspaceCreateProgressStatus,
} from "./state/workspaceCreateProgressStore";
export {
  useSelectedProjectId,
  useSelectedWorkspaceId,
  useSelectedWorkspaceWorktreePath,
  useWorkspaces,
} from "./hooks/useWorkspaceReadHooks";

// Stable UI entry points for cross-feature composition (Phase 18).
export { CreateWorkspaceDialogView } from "./features/create-workspace/CreateWorkspaceDialogView";
export { WorkspaceDeleteDialogView } from "./features/delete-workspace/WorkspaceDeleteDialogView";
export { WorkspaceInfoPopperView } from "./features/workspace-status/WorkspaceInfoPopperView";
export {
  type PendingWorkspaceDeletion,
  useWorkspaceDeletionFlow,
} from "./features/delete-workspace/useWorkspaceDeletionFlow";
export { useWorkspaceInfoHover } from "./features/workspace-status/useWorkspaceInfoHover";
export { enqueueWorkspaceErrorNotice } from "./state/workspaceLifecycleNoticeStore";
export { WorkspaceErrorStateView } from "./features/workspace-status/WorkspaceErrorStateView";
export { WorkspaceLifecycleNoticeView } from "./features/workspace-status/WorkspaceLifecycleNoticeView";
export { createWorkspaceEventHandlers } from "./events/workspaceEventHandlers";
