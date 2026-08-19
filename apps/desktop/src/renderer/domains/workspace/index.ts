import { workspaceStore } from "./state/workspaceStore";
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
} from "./workspaceTypes";
export type { RpcFrontendMessagePayload } from "@shared/contracts/rpcSchema";

export { workspaceStore, type WorkspaceStoreState } from "./state/workspaceStore";
export { activateWorkspacePane, closeWorkspace, createWorkspace, deleteLocalFolder, deleteSelectedFileTreeEntry, focusWorkspaceFileTree, openCreateWorkspaceDialog, openWorkspaceFileSearch, renameWorkspace, renameWorkspaceBranch, reorderWorkspace, setDisplayRepoIds, selectFolderInFileTree, subscribeOpenCreateWorkspaceDialog, toggleLeftPaneVisibility, toggleRightPaneVisibility, undoFileTreeOperation, refreshWorkspacePullRequest, resolveWorkspaceId, syncWorkspaceContextLinks } from "./commands/workspaceCommands";
export { createLocalFolderImport, listLocalFolders, openFoldersForSnapshot, restoreFolderSelectionIfNeeded } from "./commands/localFolderCommands";
export { buildWorkspaceOpenProjectEntries, openWorkspaceEntries, warmupWorkspacesForProjects } from "./commands/workspaceWarmupCommand";
export { syncTabStoreWithWorkspace } from "./commands/workspaceTabSync";
export { resolveWorkspaceIdForProject, resolveWorkspaceProjectId } from "./workspaceTypes";
export { workspaceCreateProgressStore, type WorkspaceCreateProgressEntry, type WorkspaceCreateProgressStep, type WorkspaceCreateProgressStatus } from "./state/workspaceCreateProgressStore";


// Stable UI entry points for cross-feature composition (Phase 18).
export { WORKSPACE_SETTINGS_STORE_STORAGE_KEY, workspaceSettingsStore, type WorkspaceSettingsStoreState } from "./state/workspaceSettingsStore";
export { useWorkspaceBranchPrefixSettings } from "./hooks/useWorkspaceBranchPrefixSettings";
export { resolveGitBranchPrefix, type GitBranchPrefixMode } from "./naming/branchPrefix";
export { CreateWorkspaceDialogView } from "./features/create-workspace/CreateWorkspaceDialogView";
export { RenameWorkspaceDialogView } from "./features/rename-workspace/RenameWorkspaceDialogView";
export { WorkspaceDeleteDialogView } from "./features/delete-workspace/WorkspaceDeleteDialogView";
export { WorkspaceInfoPopperView } from "./features/workspace-status/WorkspaceInfoPopperView";
export { type PendingWorkspaceDeletion, useWorkspaceDeletionFlow } from "./features/delete-workspace/useWorkspaceDeletionFlow";
export { useWorkspaceInfoHover } from "./features/workspace-status/useWorkspaceInfoHover";
export { enqueueWorkspaceErrorNotice } from "./state/workspaceLifecycleNoticeStore";
export { WorkspaceErrorStateView } from "./features/workspace-status/WorkspaceErrorStateView";
export { WorkspaceLifecycleNoticeView } from "./features/workspace-status/WorkspaceLifecycleNoticeView";
export { createWorkspaceEventHandlers } from "./subscriptions/workspaceEventHandlers";
// Workspace preferences + branch-naming settings (desktop7 Phase 23 — moved from Settings).
export { WorkspaceSettingsView } from "./features/workspace-preferences/WorkspaceSettingsView";
// Workspace display + local-folder model helpers (desktop7 Phase 24 — moved from root helpers).
export { LOCAL_WORKSPACE_DISPLAY_NAME, resolveExplicitWorkspaceDisplayMetadata, resolveHydratedWorkspaceDisplayMetadata, resolveWorkspaceListDisplayName } from "./naming/workspaceDisplayNames";
export { isFolderWorkspace } from "./local-folder/localFolder";

export { BranchDropdown, type BranchDropdownGroups } from "./features/create-workspace/BranchDropdown";
