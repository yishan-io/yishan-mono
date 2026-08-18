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
  closeWorkspace,
  createWorkspace,
  deleteLocalFolder,
  renameWorkspace,
  renameWorkspaceBranch,
  reorderWorkspace,
  setDisplayRepoIds,
  setLastUsedExternalAppId,
  subscribeOpenCreateWorkspaceDialog,
} from "./commands/workspaceCommands";
export { createLocalFolderImport } from "./commands/localFolderCommands";
export {
  buildWorkspaceOpenProjectEntries,
  openWorkspaceEntries,
} from "./commands/workspaceWarmupCommand";
export { syncTabStoreWithWorkspace } from "./commands/workspaceTabSync";
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
} from "./ui/hooks/useWorkspaceReadHooks";

// Stable UI entry points for cross-feature composition (Phase 18).
export { CreateWorkspaceDialogView } from "./ui/LeftPane/CreateWorkspaceDialogView";
export { WorkspaceDeleteDialogView } from "./ui/LeftPane/WorkspaceDeleteDialogView";
export { WorkspaceInfoPopperView } from "./ui/LeftPane/WorkspaceInfoPopperView";
export { type PendingWorkspaceDeletion, useWorkspaceDeletionFlow } from "./ui/LeftPane/useWorkspaceDeletionFlow";
export { useWorkspaceInfoHover } from "./ui/LeftPane/useWorkspaceInfoHover";
export { enqueueWorkspaceErrorNotice } from "./state/workspaceLifecycleNoticeStore";
export { WorkspaceErrorStateView } from "./ui/WorkspaceErrorStateView";
export { WorkspaceLifecycleNoticeView } from "./ui/WorkspaceLifecycleNoticeView";
