import { renameAgentChatSessionByTab as renameAgentChatSessionByTabCommand } from "@renderer/domains/agent";
import { createFileTabPlaceholder, seedFileTabContent as seedFileTabContentCommand } from "@renderer/domains/files";
import { seedDiffTabContent as seedDiffTabContentCommand } from "@renderer/domains/git";
import { projectStore } from "@renderer/domains/project";
import { tabStore } from "@renderer/domains/workbench";
import {
  activateProject as activateProjectCommand,
  activateWorkspace as activateWorkspaceCommand,
  closeAllTabs as closeAllTabsCommand,
  closeOtherTabs as closeOtherTabsCommand,
  closeTab as closeTabCommand,
  openTab as openTabCommand,
  openTabInOppositePane as openTabInOppositePaneCommand,
  promoteTemporaryTab as promoteTemporaryTabCommand,
  renameTab as renameTabCommand,
  renameTabsForEntryRename as renameTabsForEntryRenameCommand,
  reorderTab as reorderTabCommand,
  setBrowserTabFaviconUrl as setBrowserTabFaviconUrlCommand,
  setBrowserTabUrl as setBrowserTabUrlCommand,
  setSelectedTab as setSelectedTabCommand,
  toggleTabPinned as toggleTabPinnedCommand,
} from "@renderer/domains/workbench";
import {
  activateWorkspacePane as activateWorkspacePaneCommand,
  closeWorkspace as closeWorkspaceCommand,
  createWorkspace as createWorkspaceCommand,
  deleteLocalFolder as deleteLocalFolderCommand,
  deleteSelectedFileTreeEntry as deleteSelectedFileTreeEntryCommand,
  focusWorkspaceFileTree as focusWorkspaceFileTreeCommand,
  openCreateWorkspaceDialog as openCreateWorkspaceDialogCommand,
  openWorkspaceFileSearch as openWorkspaceFileSearchCommand,
  renameWorkspaceBranch as renameWorkspaceBranchCommand,
  renameWorkspace as renameWorkspaceCommand,
  reorderWorkspace as reorderWorkspaceCommand,
  setDisplayRepoIds as setDisplayRepoIdsCommand,
  toggleLeftPaneVisibility as toggleLeftPaneVisibilityCommand,
  toggleRightPaneVisibility as toggleRightPaneVisibilityCommand,
  undoFileTreeOperation as undoFileTreeOperationCommand,
} from "@renderer/domains/workspace";
import {
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionCommand,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
  logout as logoutCommand,
  toggleMainWindowMaximized as toggleMainWindowMaximizedCommand,
} from "./appCommands";
import { createDiffTabPlaceholder } from "./diffTabPlaceholder";

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
import type {
  AppCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
} from "./commandSurfaces";

export function createAppCommands(): AppCommandSurface {
  return {
    logout: logoutCommand,
    checkAgentGlobalConfigExternalDirectoryPermission: checkAgentGlobalConfigExternalDirectoryPermissionCommand,
    ensureAgentGlobalConfigExternalDirectoryPermission: ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
    toggleMainWindowMaximized: toggleMainWindowMaximizedCommand,
    loadWorkspaceSnapshot: loadWorkspaceSnapshotCommand,
  };
}

export function createWorkspaceCommands(): WorkspaceCommandSurface {
  return {
    activateProject: activateProjectCommand,
    activateWorkspace: activateWorkspaceCommand,
    setDisplayRepoIds: setDisplayRepoIdsCommand,
    setLastUsedExternalAppId: projectStore.getState().setLastUsedExternalAppId,
    toggleLeftPaneVisibility: toggleLeftPaneVisibilityCommand,
    toggleRightPaneVisibility: toggleRightPaneVisibilityCommand,
    activateWorkspacePane: activateWorkspacePaneCommand,
    openCreateWorkspaceDialog: openCreateWorkspaceDialogCommand,
    focusWorkspaceFileTree: focusWorkspaceFileTreeCommand,
    deleteSelectedFileTreeEntry: deleteSelectedFileTreeEntryCommand,
    undoFileTreeOperation: undoFileTreeOperationCommand,
    openWorkspaceFileSearch: openWorkspaceFileSearchCommand,
    renameWorkspace: renameWorkspaceCommand,
    reorderWorkspace: reorderWorkspaceCommand,
    renameWorkspaceBranch: renameWorkspaceBranchCommand,
    createWorkspace: createWorkspaceCommand,
    closeWorkspace: closeWorkspaceCommand,
    deleteLocalFolder: deleteLocalFolderCommand,
  };
}

export function createWorkbenchCommands(): WorkbenchCommandSurface {
  return {
    selectTab: setSelectedTabCommand,
    openTab: (input, options) => {
      openTabCommand(input, options);
      const openedTabId = tabStore.getState().selectedTabId;
      if (input.kind === "file") {
        seedFileTabContentCommand({
          tabId: openedTabId,
          path: input.path,
          content: input.content ?? createFileTabPlaceholder(input.path),
          isUnsupported: input.isUnsupported,
          unsupportedReason: input.unsupportedReason,
          isIgnored: input.isIgnored,
        });
      } else if (input.kind === "diff") {
        const placeholder = createDiffTabPlaceholder({
          path: input.path,
          kind: input.changeKind,
          additions: input.additions,
          deletions: input.deletions,
        });
        seedDiffTabContentCommand({
          tabId: openedTabId,
          path: input.path,
          oldContent: input.oldContent ?? placeholder.oldContent,
          newContent: input.newContent ?? placeholder.newContent,
          files: input.files,
        });
      }
    },
    openTabInOppositePane: openTabInOppositePaneCommand,
    closeTab: closeTabCommand,
    closeOtherTabs: closeOtherTabsCommand,
    closeAllTabs: closeAllTabsCommand,
    toggleTabPinned: toggleTabPinnedCommand,
    promoteTemporaryTab: promoteTemporaryTabCommand,
    reorderTab: reorderTabCommand,
    renameTab: (tabId, title, options) => {
      renameTabCommand(tabId, title, options);
      // The pi-session rename side effect belongs to Agent (desktop6-adjust.md W6).
      void renameAgentChatSessionByTabCommand(tabId, title).catch((error) => {
        console.error("Failed to rename pi session", error);
      });
    },
    setBrowserTabFaviconUrl: setBrowserTabFaviconUrlCommand,
    setBrowserTabUrl: setBrowserTabUrlCommand,
    renameTabsForEntryRename: renameTabsForEntryRenameCommand,
  };
}
export type {
  AppCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
} from "./commandSurfaces";
