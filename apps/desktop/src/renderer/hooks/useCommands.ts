import { useMemo } from "react";
import { listAgentDetectionStatuses as listAgentDetectionStatusesCommand } from "../commands/agentCommands";
import {
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionCommand,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
  getDefaultWorktreeLocation as getDefaultWorktreeLocationCommand,
  openLocalFolderDialog as openLocalFolderDialogCommand,
  toggleMainWindowMaximized as toggleMainWindowMaximizedCommand,
} from "../commands/appCommands";
import {
  appendChatMessages as appendChatMessagesCommand,
  closeAgentSession as closeAgentSessionCommand,
  createWorkspaceChatEventHandler as createWorkspaceChatEventHandlerCommand,
  ensureChatSession as ensureChatSessionCommand,
  getChatMessages as getChatMessagesCommand,
  runChatPrompt as runChatPromptCommand,
  setChatAvailableModels as setChatAvailableModelsCommand,
  setChatCurrentModel as setChatCurrentModelCommand,
  updateChatMessage as updateChatMessageCommand,
} from "../commands/chatCommands";
import {
  createFile as createFileCommand,
  createFolder as createFolderCommand,
  deleteEntry as deleteEntryCommand,
  importEntries as importEntriesCommand,
  importFilePayloads as importFilePayloadsCommand,
  listFiles as listFilesCommand,
  openEntryInExternalApp as openEntryInExternalAppCommand,
  pasteEntries as pasteEntriesCommand,
  readExternalClipboardSourcePaths as readExternalClipboardSourcePathsCommand,
  readFile as readFileCommand,
  renameEntry as renameEntryCommand,
  writeFile as writeFileCommand,
} from "../commands/fileCommands";
import {
  commitGitChanges as commitGitChangesCommand,
  getGitAuthorName as getGitAuthorNameCommand,
  getGitBranchStatus as getGitBranchStatusCommand,
  listGitBranches as listGitBranchesCommand,
  listGitChanges as listGitChangesCommand,
  listGitCommitsToTarget as listGitCommitsToTargetCommand,
  publishGitBranch as publishGitBranchCommand,
  pushGitBranch as pushGitBranchCommand,
  readBranchComparisonDiff as readBranchComparisonDiffCommand,
  readCommitDiff as readCommitDiffCommand,
  readDiff as readDiffCommand,
  revertGitChanges as revertGitChangesCommand,
  trackGitChanges as trackGitChangesCommand,
  unstageGitChanges as unstageGitChangesCommand,
} from "../commands/gitCommands";
import {
  getNotificationPreferences as getNotificationPreferencesCommand,
  playNotificationSound as playNotificationSoundCommand,
  previewNotification as previewNotificationCommand,
  updateNotificationPreferences as updateNotificationPreferencesCommand,
} from "../commands/notificationCommands";
import {
  createProject as createProjectCommand,
  deleteProject as deleteProjectCommand,
  loadWorkspaceFromBackend as loadWorkspaceFromBackendCommand,
  updateProjectConfig as updateProjectConfigCommand,
} from "../commands/projectCommands";
import { setSelectedRepo, setSelectedWorkspace } from "../commands/selectionCommands";
import {
  closeAllTabs as closeAllTabsCommand,
  closeOtherTabs as closeOtherTabsCommand,
  closeTab as closeTabCommand,
  createTab as createTabCommand,
  markFileTabSaved as markFileTabSavedCommand,
  openTab as openTabCommand,
  renameTab as renameTabCommand,
  reorderTab as reorderTabCommand,
  setSelectedTab as setSelectedTabCommand,
  toggleTabPinned as toggleTabPinnedCommand,
  updateFileTabContent as updateFileTabContentCommand,
} from "../commands/tabCommands";
import {
  closeTerminalSession as closeTerminalSessionCommand,
  createTerminalSession as createTerminalSessionCommand,
  getTerminalResourceUsage as getTerminalResourceUsageCommand,
  listDetectedPorts as listDetectedPortsCommand,
  listTerminalSessions as listTerminalSessionsCommand,
  readTerminalOutput as readTerminalOutputCommand,
  resizeTerminal as resizeTerminalCommand,
  subscribeTerminalOutput as subscribeTerminalOutputCommand,
  subscribeTerminalSessions as subscribeTerminalSessionsCommand,
  writeTerminalInput as writeTerminalInputCommand,
} from "../commands/terminalCommands";
import {
  activateWorkspacePane as activateWorkspacePaneCommand,
  closeWorkspace as closeWorkspaceCommand,
  createWorkspace as createWorkspaceCommand,
  deleteSelectedFileTreeEntry as deleteSelectedFileTreeEntryCommand,
  focusWorkspaceFileTree as focusWorkspaceFileTreeCommand,
  openCreateWorkspaceDialog as openCreateWorkspaceDialogCommand,
  openWorkspaceFileSearch as openWorkspaceFileSearchCommand,
  refreshWorkspaceGitChanges as refreshWorkspaceGitChangesCommand,
  renameWorkspaceBranch as renameWorkspaceBranchCommand,
  renameWorkspace as renameWorkspaceCommand,
  setDisplayRepoIds as setDisplayRepoIdsCommand,
  setLastUsedExternalAppId as setLastUsedExternalAppIdCommand,
  setLeftPaneWidth as setLeftPaneWidthCommand,
  setRightPaneWidth as setRightPaneWidthCommand,
  toggleLeftPaneVisibility as toggleLeftPaneVisibilityCommand,
  toggleRightPaneVisibility as toggleRightPaneVisibilityCommand,
  undoFileTreeOperation as undoFileTreeOperationCommand,
} from "../commands/workspaceCommands";
import type { ProjectRecord } from "../api/types";

export type Commands = {
  setSelectedRepoId: (repoId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  listAgentDetectionStatuses: typeof listAgentDetectionStatusesCommand;
  setDisplayRepoIds: typeof setDisplayRepoIdsCommand;
  setLastUsedExternalAppId: typeof setLastUsedExternalAppIdCommand;
  setLeftWidth: typeof setLeftPaneWidthCommand;
  setRightWidth: typeof setRightPaneWidthCommand;
  toggleLeftPaneVisibility: typeof toggleLeftPaneVisibilityCommand;
  toggleRightPaneVisibility: typeof toggleRightPaneVisibilityCommand;
  activateWorkspacePane: typeof activateWorkspacePaneCommand;
  openCreateWorkspaceDialog: typeof openCreateWorkspaceDialogCommand;
  focusWorkspaceFileTree: typeof focusWorkspaceFileTreeCommand;
  deleteSelectedFileTreeEntry: typeof deleteSelectedFileTreeEntryCommand;
  undoFileTreeOperation: typeof undoFileTreeOperationCommand;
  openWorkspaceFileSearch: typeof openWorkspaceFileSearchCommand;
  renameWorkspace: typeof renameWorkspaceCommand;
  renameWorkspaceBranch: typeof renameWorkspaceBranchCommand;
  openLocalFolderDialog: typeof openLocalFolderDialogCommand;
  getDefaultWorktreeLocation: typeof getDefaultWorktreeLocationCommand;
  checkAgentGlobalConfigExternalDirectoryPermission: typeof checkAgentGlobalConfigExternalDirectoryPermissionCommand;
  ensureAgentGlobalConfigExternalDirectoryPermission: typeof ensureAgentGlobalConfigExternalDirectoryPermissionCommand;
  toggleMainWindowMaximized: typeof toggleMainWindowMaximizedCommand;
  ensureChatSession: typeof ensureChatSessionCommand;
  runChatPrompt: typeof runChatPromptCommand;
  closeAgentSession: typeof closeAgentSessionCommand;
  getChatMessages: typeof getChatMessagesCommand;
  appendChatMessages: typeof appendChatMessagesCommand;
  updateChatMessage: typeof updateChatMessageCommand;
  setChatAvailableModels: typeof setChatAvailableModelsCommand;
  setChatCurrentModel: typeof setChatCurrentModelCommand;
  createWorkspaceChatEventHandler: typeof createWorkspaceChatEventHandlerCommand;
  listFiles: typeof listFilesCommand;
  readFile: typeof readFileCommand;
  writeFile: typeof writeFileCommand;
  createFile: typeof createFileCommand;
  createFolder: typeof createFolderCommand;
  renameEntry: typeof renameEntryCommand;
  deleteEntry: typeof deleteEntryCommand;
  openEntryInExternalApp: typeof openEntryInExternalAppCommand;
  readExternalClipboardSourcePaths: typeof readExternalClipboardSourcePathsCommand;
  pasteEntries: typeof pasteEntriesCommand;
  importEntries: typeof importEntriesCommand;
  importFilePayloads: typeof importFilePayloadsCommand;
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
  createTerminalSession: typeof createTerminalSessionCommand;
  writeTerminalInput: typeof writeTerminalInputCommand;
  resizeTerminal: typeof resizeTerminalCommand;
  readTerminalOutput: typeof readTerminalOutputCommand;
  listDetectedPorts: typeof listDetectedPortsCommand;
  getTerminalResourceUsage: typeof getTerminalResourceUsageCommand;
  listTerminalSessions: typeof listTerminalSessionsCommand;
  subscribeTerminalOutput: typeof subscribeTerminalOutputCommand;
  subscribeTerminalSessions: typeof subscribeTerminalSessionsCommand;
  closeTerminalSession: typeof closeTerminalSessionCommand;
  getNotificationPreferences: typeof getNotificationPreferencesCommand;
  updateNotificationPreferences: typeof updateNotificationPreferencesCommand;
  previewNotification: typeof previewNotificationCommand;
  playNotificationSound: typeof playNotificationSoundCommand;
  loadWorkspaceFromBackend: () => Promise<void>;
  createProject: (input: {
    name: string;
    key?: string;
    source: "local" | "remote";
    path?: string;
    gitUrl?: string;
  }) => Promise<void>;
  deleteProject: (repoId: string) => Promise<void>;
  updateProjectConfig: (
    repoId: string,
    config: Pick<
      ProjectRecord,
      "name" | "worktreePath" | "privateContextEnabled" | "icon" | "iconBgColor" | "setupScript" | "postScript"
    >,
  ) => Promise<void>;
  createWorkspace: (input: {
    repoId: string;
    name: string;
    sourceBranch?: string;
    targetBranch?: string;
  }) => Promise<void>;
  closeWorkspace: (workspaceId: string, options?: { removeBranch?: boolean }) => Promise<void>;
  refreshWorkspaceGitChanges: (workspaceId: string, workspaceWorktreePath: string) => Promise<void>;
  setSelectedTabId: typeof setSelectedTabCommand;
  createTab: (input?: { workspaceId?: string }) => Promise<void>;
  openTab: typeof openTabCommand;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (tabId: string) => void;
  toggleTabPinned: typeof toggleTabPinnedCommand;
  reorderTab: typeof reorderTabCommand;
  renameTab: typeof renameTabCommand;
  updateFileTabContent: typeof updateFileTabContentCommand;
  markFileTabSaved: typeof markFileTabSavedCommand;
};

/** Returns UI-facing command handlers wired to command modules and pure store actions. */
export function useCommands(): Commands {
  return useMemo(
    () => ({
      setSelectedRepoId: setSelectedRepo,
      setSelectedWorkspaceId: setSelectedWorkspace,
      listAgentDetectionStatuses: listAgentDetectionStatusesCommand,
      setDisplayRepoIds: setDisplayRepoIdsCommand,
      setLastUsedExternalAppId: setLastUsedExternalAppIdCommand,
      setLeftWidth: setLeftPaneWidthCommand,
      setRightWidth: setRightPaneWidthCommand,
      toggleLeftPaneVisibility: toggleLeftPaneVisibilityCommand,
      toggleRightPaneVisibility: toggleRightPaneVisibilityCommand,
      activateWorkspacePane: activateWorkspacePaneCommand,
      openCreateWorkspaceDialog: openCreateWorkspaceDialogCommand,
      focusWorkspaceFileTree: focusWorkspaceFileTreeCommand,
      deleteSelectedFileTreeEntry: deleteSelectedFileTreeEntryCommand,
      undoFileTreeOperation: undoFileTreeOperationCommand,
      openWorkspaceFileSearch: openWorkspaceFileSearchCommand,
      renameWorkspace: renameWorkspaceCommand,
      renameWorkspaceBranch: renameWorkspaceBranchCommand,
      openLocalFolderDialog: openLocalFolderDialogCommand,
      getDefaultWorktreeLocation: getDefaultWorktreeLocationCommand,
      checkAgentGlobalConfigExternalDirectoryPermission: checkAgentGlobalConfigExternalDirectoryPermissionCommand,
      ensureAgentGlobalConfigExternalDirectoryPermission: ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
      toggleMainWindowMaximized: toggleMainWindowMaximizedCommand,
      ensureChatSession: ensureChatSessionCommand,
      runChatPrompt: runChatPromptCommand,
      closeAgentSession: closeAgentSessionCommand,
      getChatMessages: getChatMessagesCommand,
      appendChatMessages: appendChatMessagesCommand,
      updateChatMessage: updateChatMessageCommand,
      setChatAvailableModels: setChatAvailableModelsCommand,
      setChatCurrentModel: setChatCurrentModelCommand,
      createWorkspaceChatEventHandler: createWorkspaceChatEventHandlerCommand,
      listFiles: listFilesCommand,
      readFile: readFileCommand,
      writeFile: writeFileCommand,
      createFile: createFileCommand,
      createFolder: createFolderCommand,
      renameEntry: renameEntryCommand,
      deleteEntry: deleteEntryCommand,
      openEntryInExternalApp: openEntryInExternalAppCommand,
      readExternalClipboardSourcePaths: readExternalClipboardSourcePathsCommand,
      pasteEntries: pasteEntriesCommand,
      importEntries: importEntriesCommand,
      importFilePayloads: importFilePayloadsCommand,
      readDiff: readDiffCommand,
      readCommitDiff: readCommitDiffCommand,
      readBranchComparisonDiff: readBranchComparisonDiffCommand,
      listGitChanges: listGitChangesCommand,
      trackGitChanges: trackGitChangesCommand,
      unstageGitChanges: unstageGitChangesCommand,
      revertGitChanges: revertGitChangesCommand,
      commitGitChanges: commitGitChangesCommand,
      getGitBranchStatus: getGitBranchStatusCommand,
      listGitCommitsToTarget: listGitCommitsToTargetCommand,
      listGitBranches: listGitBranchesCommand,
      getGitAuthorName: getGitAuthorNameCommand,
      pushGitBranch: pushGitBranchCommand,
      publishGitBranch: publishGitBranchCommand,
      createTerminalSession: createTerminalSessionCommand,
      writeTerminalInput: writeTerminalInputCommand,
      resizeTerminal: resizeTerminalCommand,
      readTerminalOutput: readTerminalOutputCommand,
      listDetectedPorts: listDetectedPortsCommand,
      getTerminalResourceUsage: getTerminalResourceUsageCommand,
      listTerminalSessions: listTerminalSessionsCommand,
      subscribeTerminalOutput: subscribeTerminalOutputCommand,
      subscribeTerminalSessions: subscribeTerminalSessionsCommand,
      closeTerminalSession: closeTerminalSessionCommand,
      getNotificationPreferences: getNotificationPreferencesCommand,
      updateNotificationPreferences: updateNotificationPreferencesCommand,
      previewNotification: previewNotificationCommand,
      playNotificationSound: playNotificationSoundCommand,
      setSelectedTabId: setSelectedTabCommand,
      loadWorkspaceFromBackend: loadWorkspaceFromBackendCommand,
      createProject: createProjectCommand,
      deleteProject: deleteProjectCommand,
      updateProjectConfig: updateProjectConfigCommand,
      createWorkspace: createWorkspaceCommand,
      closeWorkspace: closeWorkspaceCommand,
      createTab: createTabCommand,
      openTab: openTabCommand,
      closeTab: closeTabCommand,
      closeOtherTabs: closeOtherTabsCommand,
      closeAllTabs: closeAllTabsCommand,
      toggleTabPinned: toggleTabPinnedCommand,
      reorderTab: reorderTabCommand,
      renameTab: renameTabCommand,
      updateFileTabContent: updateFileTabContentCommand,
      markFileTabSaved: markFileTabSavedCommand,
      refreshWorkspaceGitChanges: refreshWorkspaceGitChangesCommand,
    }),
    [],
  );
}
