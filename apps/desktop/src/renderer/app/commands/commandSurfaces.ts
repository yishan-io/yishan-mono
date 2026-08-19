import type { ExternalAppId } from "@shared/contracts/externalApps";
/**
 * App command surfaces (desktop8 Phase 33: split from composition.ts).
 *
 * Each surface is the typed command contract exposed to UI; factories in
 * `composition.ts` produce the concrete command objects.
 */

import { tabStore } from "@renderer/domains/workbench";
import {
  type activateProject as activateProjectCommand,
  type activateWorkspace as activateWorkspaceCommand,
  closeAllTabs as closeAllTabsCommand,
  closeOtherTabs as closeOtherTabsCommand,
  type closeTab as closeTabCommand,
  type openTab as openTabCommand,
  type openTabInOppositePane as openTabInOppositePaneCommand,
  type promoteTemporaryTab as promoteTemporaryTabCommand,
  type renameTab as renameTabCommand,
  type renameTabsForEntryRename as renameTabsForEntryRenameCommand,
  type reorderTab as reorderTabCommand,
  type setBrowserTabFaviconUrl as setBrowserTabFaviconUrlCommand,
  type setBrowserTabUrl as setBrowserTabUrlCommand,
  type setSelectedTab as setSelectedTabCommand,
  type toggleTabPinned as toggleTabPinnedCommand,
} from "@renderer/domains/workbench";
import {
  type activateWorkspacePane as activateWorkspacePaneCommand,
  closeWorkspace as closeWorkspaceCommand,
  createWorkspace as createWorkspaceCommand,
  type deleteLocalFolder as deleteLocalFolderCommand,
  type deleteSelectedFileTreeEntry as deleteSelectedFileTreeEntryCommand,
  type focusWorkspaceFileTree as focusWorkspaceFileTreeCommand,
  type openCreateWorkspaceDialog as openCreateWorkspaceDialogCommand,
  type openWorkspaceFileSearch as openWorkspaceFileSearchCommand,
  type renameWorkspaceBranch as renameWorkspaceBranchCommand,
  type renameWorkspace as renameWorkspaceCommand,
  type reorderWorkspace as reorderWorkspaceCommand,
  type setDisplayRepoIds as setDisplayRepoIdsCommand,
  type toggleLeftPaneVisibility as toggleLeftPaneVisibilityCommand,
  type toggleRightPaneVisibility as toggleRightPaneVisibilityCommand,
  type undoFileTreeOperation as undoFileTreeOperationCommand,
} from "@renderer/domains/workspace";
import type {
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionCommand,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
  logout as logoutCommand,
  toggleMainWindowMaximized as toggleMainWindowMaximizedCommand,
} from "./appCommands";
import { loadWorkspaceSnapshot as loadWorkspaceSnapshotCommand } from "./workspaceSnapshotFlow";

/**
 * Application command composition (Phase 12, desktop5.md).
 *
 * The global Commands object is split into per-feature command surfaces. Each
 * surface is independently requestable (useWorkspaceCommands etc.); the
 * composed `Commands` type is the union of all surfaces and remains the
 * compatibility entry for app-level consumers (e.g. the shortcut runtime).
 */

/** App-level commands (Electron host, auth, app flows). */

export type AppCommandSurface = {
  logout: typeof logoutCommand;
  checkAgentGlobalConfigExternalDirectoryPermission: typeof checkAgentGlobalConfigExternalDirectoryPermissionCommand;
  ensureAgentGlobalConfigExternalDirectoryPermission: typeof ensureAgentGlobalConfigExternalDirectoryPermissionCommand;
  toggleMainWindowMaximized: typeof toggleMainWindowMaximizedCommand;
  loadWorkspaceSnapshot: () => Promise<void>;
};

/** Workspace feature command surface. */
export type WorkspaceCommandSurface = {
  activateProject: typeof activateProjectCommand;
  activateWorkspace: typeof activateWorkspaceCommand;
  setDisplayRepoIds: typeof setDisplayRepoIdsCommand;
  setLastUsedExternalAppId: (appId: ExternalAppId) => void;
  toggleLeftPaneVisibility: typeof toggleLeftPaneVisibilityCommand;
  toggleRightPaneVisibility: typeof toggleRightPaneVisibilityCommand;
  activateWorkspacePane: typeof activateWorkspacePaneCommand;
  openCreateWorkspaceDialog: typeof openCreateWorkspaceDialogCommand;
  focusWorkspaceFileTree: typeof focusWorkspaceFileTreeCommand;
  deleteSelectedFileTreeEntry: typeof deleteSelectedFileTreeEntryCommand;
  undoFileTreeOperation: typeof undoFileTreeOperationCommand;
  openWorkspaceFileSearch: typeof openWorkspaceFileSearchCommand;
  renameWorkspace: typeof renameWorkspaceCommand;
  reorderWorkspace: typeof reorderWorkspaceCommand;
  renameWorkspaceBranch: typeof renameWorkspaceBranchCommand;
  createWorkspace: (input: {
    projectId: string;
    name: string;
    sourceBranch?: string;
    targetBranch?: string;
    nodeId?: string;
    taskRun?: {
      agentKind: string;
      prompt: string;
      model?: string;
    };
  }) => Promise<string | undefined>;
  closeWorkspace: (workspaceId: string, options?: { removeBranch?: boolean }) => Promise<void>;
  deleteLocalFolder: typeof deleteLocalFolderCommand;
};

/** Workbench feature command surface. */
export type WorkbenchCommandSurface = {
  selectTab: typeof setSelectedTabCommand;
  openTab: typeof openTabCommand;
  openTabInOppositePane: typeof openTabInOppositePaneCommand;
  closeTab: typeof closeTabCommand;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (tabId: string) => void;
  toggleTabPinned: typeof toggleTabPinnedCommand;
  promoteTemporaryTab: typeof promoteTemporaryTabCommand;
  reorderTab: typeof reorderTabCommand;
  renameTab: typeof renameTabCommand;
  setBrowserTabFaviconUrl: typeof setBrowserTabFaviconUrlCommand;
  setBrowserTabUrl: typeof setBrowserTabUrlCommand;
  renameTabsForEntryRename: typeof renameTabsForEntryRenameCommand;
};
