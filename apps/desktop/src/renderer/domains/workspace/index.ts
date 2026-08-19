/**
 * Workspace feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, workspace models, and the public State
 * surfaces (selectors + actions). The Workspace Stores are internal.
 */
export type {
  WorkspaceGitChangeTotals,
  WorkspaceHealth,
  WorkspaceItem,
  WorkspaceLifecycleState,
  WorkspaceStatus,
} from "./model/workspaceTypes";
export { selectWorkspaces } from "./state/workspaceSelectors";
export type { RpcFrontendMessagePayload } from "@shared/contracts/rpcSchema";

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
  selectFolderInFileTree,
  subscribeOpenCreateWorkspaceDialog,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
  refreshWorkspacePullRequest,
  resolveWorkspaceId,
  syncWorkspaceContextLinks,
} from "./commands/workspaceCommands";
export {
  createLocalFolderImport,
  listLocalFolders,
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
  addWorkspace,
  setOrderedWorkspaceIds,
} from "./state/workspaceStateMutations";
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
export {
  WORKSPACE_SETTINGS_STORE_STORAGE_KEY,
  workspaceSettingsStore,
  type WorkspaceSettingsStoreState,
} from "./state/workspaceSettingsStore";
export { selectIsDefaultContextEnabled } from "./state/workspaceSettingsSelectors";
export { useWorkspaceBranchPrefixSettings } from "./hooks/useWorkspaceBranchPrefixSettings";
export { resolveGitBranchPrefix, type GitBranchPrefixMode } from "./model/branchPrefix";
export { CreateWorkspaceDialogView } from "./features/create-workspace/CreateWorkspaceDialogView";
export { RenameWorkspaceDialogView } from "./features/rename-workspace/RenameWorkspaceDialogView";
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
// Workspace preferences + branch-naming settings (desktop7 Phase 23 — moved from Settings).
export { WorkspaceSettingsView } from "./features/workspace-preferences/WorkspaceSettingsView";
// Workspace display + local-folder model helpers (desktop7 Phase 24 — moved from root helpers).
export {
  LOCAL_WORKSPACE_DISPLAY_NAME,
  resolveExplicitWorkspaceDisplayMetadata,
  resolveHydratedWorkspaceDisplayMetadata,
  resolveWorkspaceListDisplayName,
} from "./services/workspaceDisplayNames";
export { isFolderWorkspace } from "./model/localFolder";

export { BranchDropdown, type BranchDropdownGroups } from "./features/create-workspace/BranchDropdown";
