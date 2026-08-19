import type { ExternalAppId } from "@shared/contracts/externalApps";
/**
 * App command surfaces (desktop8 Phase 33: split from composition.ts).
 *
 * Each surface is the typed command contract exposed to UI; factories in
 * `composition.ts` produce the concrete command objects.
 */

import {
  type appendChatMessages as appendChatMessagesCommand,
  type closeAgentSession as closeAgentSessionCommand,
  type createWorkspaceChatEventHandler as createWorkspaceChatEventHandlerCommand,
  type ensureChatSession as ensureChatSessionCommand,
  type getChatMessages as getChatMessagesCommand,
  type listActivePiSessions as listActivePiSessionsCommand,
  type listAgentDetectionStatuses as listAgentDetectionStatusesCommand,
  type listAgentModels as listAgentModelsCommand,
  type listPiProviders as listPiProvidersCommand,
  type openPiProviderLogin as openPiProviderLoginCommand,
  type removePiProvider as removePiProviderCommand,
  renameAgentChatSessionByTab as renameAgentChatSessionByTabCommand,
  type runChatPrompt as runChatPromptCommand,
  type savePiProvider as savePiProviderCommand,
  type setChatAvailableModels as setChatAvailableModelsCommand,
  type setChatCurrentModel as setChatCurrentModelCommand,
  type updateChatMessage as updateChatMessageCommand,
} from "@renderer/domains/agent";
import {
  type createFile as createFileCommand,
  createFileTabPlaceholder,
  type createFolder as createFolderCommand,
  type createNewWhiteboard as createNewWhiteboardCommand,
  type deleteEntry as deleteEntryCommand,
  type listDetectedExternalAppIds as listDetectedExternalAppIdsCommand,
  type listFiles as listFilesCommand,
  type markFileTabSaved as markFileTabSavedCommand,
  type openEntryInExternalApp as openEntryInExternalAppCommand,
  type readExternalClipboardSourcePaths as readExternalClipboardSourcePathsCommand,
  type readFile as readFileCommand,
  type refreshFileTabFromDisk as refreshFileTabFromDiskCommand,
  type renameEntry as renameEntryCommand,
  type resolveNextWhiteboardPath as resolveNextWhiteboardPathCommand,
  seedFileTabContent as seedFileTabContentCommand,
  type updateFileTabContent as updateFileTabContentCommand,
  type writeFile as writeFileCommand,
} from "@renderer/domains/files";
import {
  type commitGitChanges as commitGitChangesCommand,
  type getGitAuthorName as getGitAuthorNameCommand,
  type getGitBranchStatus as getGitBranchStatusCommand,
  type listGitBranches as listGitBranchesCommand,
  type listGitChanges as listGitChangesCommand,
  type listGitCommitsToTarget as listGitCommitsToTargetCommand,
  type listPullRequestHistory as listPullRequestHistoryCommand,
  type publishGitBranch as publishGitBranchCommand,
  type pushGitBranch as pushGitBranchCommand,
  type readBranchComparisonDiff as readBranchComparisonDiffCommand,
  type readCommitDiff as readCommitDiffCommand,
  type readDiff as readDiffCommand,
  type refreshDiffTabContent as refreshDiffTabContentCommand,
  type refreshWorkspaceGitChanges as refreshWorkspaceGitChangesCommand,
  type refreshWorkspacePullRequest as refreshWorkspacePullRequestCommand,
  type revertGitChanges as revertGitChangesCommand,
  seedDiffTabContent as seedDiffTabContentCommand,
  type trackGitChanges as trackGitChangesCommand,
  type unstageGitChanges as unstageGitChangesCommand,
} from "@renderer/domains/git";
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

/** Agent feature command surface. */
export type AgentCommandSurface = {
  listAgentDetectionStatuses: typeof listAgentDetectionStatusesCommand;
  listAgentModels: typeof listAgentModelsCommand;
  listPiProviders: typeof listPiProvidersCommand;
  savePiProvider: typeof savePiProviderCommand;
  removePiProvider: typeof removePiProviderCommand;
  openPiProviderLogin: typeof openPiProviderLoginCommand;
  ensureChatSession: typeof ensureChatSessionCommand;
  runChatPrompt: typeof runChatPromptCommand;
  closeAgentSession: typeof closeAgentSessionCommand;
  getChatMessages: typeof getChatMessagesCommand;
  appendChatMessages: typeof appendChatMessagesCommand;
  updateChatMessage: typeof updateChatMessageCommand;
  setChatAvailableModels: typeof setChatAvailableModelsCommand;
  setChatCurrentModel: typeof setChatCurrentModelCommand;
  createWorkspaceChatEventHandler: typeof createWorkspaceChatEventHandlerCommand;
  listActivePiSessions: typeof listActivePiSessionsCommand;
};

/** Git feature command surface. */
export type GitCommandSurface = {
  readDiff: typeof readDiffCommand;
  readCommitDiff: typeof readCommitDiffCommand;
  readBranchComparisonDiff: typeof readBranchComparisonDiffCommand;
  listGitChanges: typeof listGitChangesCommand;
  trackGitChanges: typeof trackGitChangesCommand;
  unstageGitChanges: typeof unstageGitChangesCommand;
  revertGitChanges: typeof revertGitChangesCommand;
  commitGitChanges: typeof commitGitChangesCommand;
  getGitBranchStatus: typeof getGitBranchStatusCommand;
  listGitCommitsToTarget: typeof listGitCommitsToTargetCommand;
  listGitBranches: typeof listGitBranchesCommand;
  getGitAuthorName: typeof getGitAuthorNameCommand;
  pushGitBranch: typeof pushGitBranchCommand;
  publishGitBranch: typeof publishGitBranchCommand;
  refreshWorkspaceGitChanges: typeof refreshWorkspaceGitChangesCommand;
  refreshWorkspacePullRequest: typeof refreshWorkspacePullRequestCommand;
  listPullRequestHistory: typeof listPullRequestHistoryCommand;
  refreshDiffTabContent: typeof refreshDiffTabContentCommand;
};

/** Files feature command surface. */
export type FileCommandSurface = {
  listFiles: typeof listFilesCommand;
  readFile: typeof readFileCommand;
  writeFile: typeof writeFileCommand;
  createFile: typeof createFileCommand;
  createFolder: typeof createFolderCommand;
  renameEntry: typeof renameEntryCommand;
  deleteEntry: typeof deleteEntryCommand;
  openEntryInExternalApp: typeof openEntryInExternalAppCommand;
  listDetectedExternalAppIds: typeof listDetectedExternalAppIdsCommand;
  readExternalClipboardSourcePaths: typeof readExternalClipboardSourcePathsCommand;
  createNewWhiteboard: typeof createNewWhiteboardCommand;
  resolveNextWhiteboardPath: typeof resolveNextWhiteboardPathCommand;
  updateFileTabContent: typeof updateFileTabContentCommand;
  markFileTabSaved: typeof markFileTabSavedCommand;
  refreshFileTabFromDisk: typeof refreshFileTabFromDiskCommand;
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

/** The composed application command surface (all features). */
export type Commands = AppCommandSurface &
  WorkspaceCommandSurface &
  AgentCommandSurface &
  GitCommandSurface &
  FileCommandSurface &
  WorkbenchCommandSurface;
