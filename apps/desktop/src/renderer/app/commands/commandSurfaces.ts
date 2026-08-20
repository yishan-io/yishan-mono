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
