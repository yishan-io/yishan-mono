import { useMemo } from "react";
import {
  listAgentDetectionStatuses as listAgentDetectionStatusesCommand,
  listAgentModels as listAgentModelsCommand,
} from "../commands/agentCommands";
import {
  appendBrowserHistory as appendBrowserHistoryCommand,
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionCommand,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
  getDefaultWorktreeLocation as getDefaultWorktreeLocationCommand,
  loadBrowserHistory as loadBrowserHistoryCommand,
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
import { listCLIToolStatuses as listCLIToolStatusesCommand } from "../commands/cliToolCommands";
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
import { checkGitHubConnectionStatus as checkGitHubConnectionStatusCommand } from "../commands/integrationCommands";
import {
  getNotificationPreferences as getNotificationPreferencesCommand,
  playNotificationSound as playNotificationSoundCommand,
  previewNotification as previewNotificationCommand,
  updateNotificationPreferences as updateNotificationPreferencesCommand,
} from "../commands/notificationCommands";
import {
  loadAllOverviewData as loadAllOverviewDataCommand,
  setOverviewProjectId as setOverviewProjectIdCommand,
  setOverviewTimeRange as setOverviewTimeRangeCommand,
} from "../commands/overviewCommands";
import {
  createProject as createProjectCommand,
  deleteProject as deleteProjectCommand,
  inspectLocalProjectSource as inspectLocalProjectSourceCommand,
  loadWorkspaceFromBackend as loadWorkspaceFromBackendCommand,
  updateProjectConfig as updateProjectConfigCommand,
} from "../commands/projectCommands";
import {
  createScheduledJob as createScheduledJobCommand,
  deleteScheduledJob as deleteScheduledJobCommand,
  loadScheduledJobs as loadScheduledJobsCommand,
  pauseScheduledJob as pauseScheduledJobCommand,
  resumeScheduledJob as resumeScheduledJobCommand,
  runScheduledJobNow as runScheduledJobNowCommand,
  updateScheduledJob as updateScheduledJobCommand,
} from "../commands/scheduledJobCommands";
import { setSelectedRepo, setSelectedWorkspace } from "../commands/selectionCommands";
import {
  closeAllTabs as closeAllTabsCommand,
  closeOtherTabs as closeOtherTabsCommand,
  closeTab as closeTabCommand,
  createTab as createTabCommand,
  markFileTabSaved as markFileTabSavedCommand,
  openTab as openTabCommand,
  promoteTemporaryTab as promoteTemporaryTabCommand,
  refreshDiffTabContent as refreshDiffTabContentCommand,
  refreshFileTabFromDisk as refreshFileTabFromDiskCommand,
  renameTab as renameTabCommand,
  renameTabsForEntryRename as renameTabsForEntryRenameCommand,
  reorderTab as reorderTabCommand,
  setBrowserTabFaviconUrl as setBrowserTabFaviconUrlCommand,
  setBrowserTabUrl as setBrowserTabUrlCommand,
  setSelectedTab as setSelectedTabCommand,
  toggleTabPinned as toggleTabPinnedCommand,
  updateFileTabContent as updateFileTabContentCommand,
} from "../commands/tabCommands";
import {
  closeTerminalSession as closeTerminalSessionCommand,
  createTerminalSession as createTerminalSessionCommand,
  getTerminalResourceUsage as getTerminalResourceUsageCommand,
  killTerminalProcess as killTerminalProcessCommand,
  listDetectedPorts as listDetectedPortsCommand,
  listTerminalSessions as listTerminalSessionsCommand,
  readTerminalOutput as readTerminalOutputCommand,
  resizeTerminal as resizeTerminalCommand,
  setActiveWorkspace as setActiveWorkspaceCommand,
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
  reorderWorkspace as reorderWorkspaceCommand,
  setDisplayRepoIds as setDisplayRepoIdsCommand,
  setLastUsedExternalAppId as setLastUsedExternalAppIdCommand,
  setLeftPaneWidth as setLeftPaneWidthCommand,
  setRightPaneWidth as setRightPaneWidthCommand,
  toggleLeftPaneVisibility as toggleLeftPaneVisibilityCommand,
  toggleRightPaneVisibility as toggleRightPaneVisibilityCommand,
  undoFileTreeOperation as undoFileTreeOperationCommand,
} from "../commands/workspaceCommands";
import type { WorkspaceProjectRecord } from "../store/types";

export type Commands = {
  setSelectedRepoId: (repoId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  listAgentDetectionStatuses: typeof listAgentDetectionStatusesCommand;
  listAgentModels: typeof listAgentModelsCommand;
  loadScheduledJobs: typeof loadScheduledJobsCommand;
  createScheduledJob: typeof createScheduledJobCommand;
  updateScheduledJob: typeof updateScheduledJobCommand;
  deleteScheduledJob: typeof deleteScheduledJobCommand;
  pauseScheduledJob: typeof pauseScheduledJobCommand;
  resumeScheduledJob: typeof resumeScheduledJobCommand;
  runScheduledJobNow: typeof runScheduledJobNowCommand;
  loadAllOverviewData: typeof loadAllOverviewDataCommand;
  setOverviewTimeRange: typeof setOverviewTimeRangeCommand;
  setOverviewProjectId: typeof setOverviewProjectIdCommand;
  listCLIToolStatuses: typeof listCLIToolStatusesCommand;
  checkGitHubConnectionStatus: typeof checkGitHubConnectionStatusCommand;
  setDisplayRepoIds: typeof setDisplayRepoIdsCommand;
  setLastUsedExternalAppId: typeof setLastUsedExternalAppIdCommand;
  setLeftPaneWidth: typeof setLeftPaneWidthCommand;
  setRightPaneWidth: typeof setRightPaneWidthCommand;
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
  openLocalFolderDialog: typeof openLocalFolderDialogCommand;
  getDefaultWorktreeLocation: typeof getDefaultWorktreeLocationCommand;
  checkAgentGlobalConfigExternalDirectoryPermission: typeof checkAgentGlobalConfigExternalDirectoryPermissionCommand;
  ensureAgentGlobalConfigExternalDirectoryPermission: typeof ensureAgentGlobalConfigExternalDirectoryPermissionCommand;
  toggleMainWindowMaximized: typeof toggleMainWindowMaximizedCommand;
  loadBrowserHistory: typeof loadBrowserHistoryCommand;
  appendBrowserHistory: typeof appendBrowserHistoryCommand;
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
  setActiveWorkspace: typeof setActiveWorkspaceCommand;
  getTerminalResourceUsage: typeof getTerminalResourceUsageCommand;
  listTerminalSessions: typeof listTerminalSessionsCommand;
  subscribeTerminalOutput: typeof subscribeTerminalOutputCommand;
  subscribeTerminalSessions: typeof subscribeTerminalSessionsCommand;
  closeTerminalSession: typeof closeTerminalSessionCommand;
  killTerminalProcess: typeof killTerminalProcessCommand;
  getNotificationPreferences: typeof getNotificationPreferencesCommand;
  updateNotificationPreferences: typeof updateNotificationPreferencesCommand;
  previewNotification: typeof previewNotificationCommand;
  playNotificationSound: typeof playNotificationSoundCommand;
  loadWorkspaceFromBackend: () => Promise<void>;
  inspectLocalProjectSource: typeof inspectLocalProjectSourceCommand;
  createProject: (input: {
    name: string;
    sourceTypeHint?: "unknown" | "git-local" | "git";
    path?: string;
    gitUrl?: string;
  }) => Promise<void>;
  deleteProject: (repoId: string) => Promise<void>;
  updateProjectConfig: typeof updateProjectConfigCommand;
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
  refreshWorkspaceGitChanges: (workspaceId: string, workspaceWorktreePath: string) => Promise<void>;
  selectTab: typeof setSelectedTabCommand;
  createTab: (input?: { workspaceId?: string }) => Promise<void>;
  openTab: typeof openTabCommand;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (tabId: string) => void;
  toggleTabPinned: typeof toggleTabPinnedCommand;
  promoteTemporaryTab: typeof promoteTemporaryTabCommand;
  reorderTab: typeof reorderTabCommand;
  renameTab: typeof renameTabCommand;
  setBrowserTabFaviconUrl: typeof setBrowserTabFaviconUrlCommand;
  setBrowserTabUrl: typeof setBrowserTabUrlCommand;
  renameTabsForEntryRename: typeof renameTabsForEntryRenameCommand;
  updateFileTabContent: typeof updateFileTabContentCommand;
  markFileTabSaved: typeof markFileTabSavedCommand;
  refreshFileTabFromDisk: typeof refreshFileTabFromDiskCommand;
  refreshDiffTabContent: typeof refreshDiffTabContentCommand;
};

/** Returns UI-facing command handlers wired to command modules and pure store actions. */
export function useCommands(): Commands {
  return useMemo(
    () => ({
      setSelectedRepoId: setSelectedRepo,
      setSelectedWorkspaceId: setSelectedWorkspace,
      listAgentDetectionStatuses: listAgentDetectionStatusesCommand,
      listAgentModels: listAgentModelsCommand,
      loadScheduledJobs: loadScheduledJobsCommand,
      createScheduledJob: createScheduledJobCommand,
      updateScheduledJob: updateScheduledJobCommand,
      deleteScheduledJob: deleteScheduledJobCommand,
      pauseScheduledJob: pauseScheduledJobCommand,
      resumeScheduledJob: resumeScheduledJobCommand,
      runScheduledJobNow: runScheduledJobNowCommand,
      loadAllOverviewData: loadAllOverviewDataCommand,
      setOverviewTimeRange: setOverviewTimeRangeCommand,
      setOverviewProjectId: setOverviewProjectIdCommand,
      listCLIToolStatuses: listCLIToolStatusesCommand,
      checkGitHubConnectionStatus: checkGitHubConnectionStatusCommand,
      setDisplayRepoIds: setDisplayRepoIdsCommand,
      setLastUsedExternalAppId: setLastUsedExternalAppIdCommand,
      setLeftPaneWidth: setLeftPaneWidthCommand,
      setRightPaneWidth: setRightPaneWidthCommand,
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
      openLocalFolderDialog: openLocalFolderDialogCommand,
      getDefaultWorktreeLocation: getDefaultWorktreeLocationCommand,
      checkAgentGlobalConfigExternalDirectoryPermission: checkAgentGlobalConfigExternalDirectoryPermissionCommand,
      ensureAgentGlobalConfigExternalDirectoryPermission: ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
      toggleMainWindowMaximized: toggleMainWindowMaximizedCommand,
      loadBrowserHistory: loadBrowserHistoryCommand,
      appendBrowserHistory: appendBrowserHistoryCommand,
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
      setActiveWorkspace: setActiveWorkspaceCommand,
      getTerminalResourceUsage: getTerminalResourceUsageCommand,
      listTerminalSessions: listTerminalSessionsCommand,
      subscribeTerminalOutput: subscribeTerminalOutputCommand,
      subscribeTerminalSessions: subscribeTerminalSessionsCommand,
      closeTerminalSession: closeTerminalSessionCommand,
      killTerminalProcess: killTerminalProcessCommand,
      getNotificationPreferences: getNotificationPreferencesCommand,
      updateNotificationPreferences: updateNotificationPreferencesCommand,
      previewNotification: previewNotificationCommand,
      playNotificationSound: playNotificationSoundCommand,
      selectTab: setSelectedTabCommand,
      loadWorkspaceFromBackend: loadWorkspaceFromBackendCommand,
      inspectLocalProjectSource: inspectLocalProjectSourceCommand,
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
      promoteTemporaryTab: promoteTemporaryTabCommand,
      reorderTab: reorderTabCommand,
      renameTab: renameTabCommand,
      setBrowserTabFaviconUrl: setBrowserTabFaviconUrlCommand,
      setBrowserTabUrl: setBrowserTabUrlCommand,
      renameTabsForEntryRename: renameTabsForEntryRenameCommand,
      updateFileTabContent: updateFileTabContentCommand,
      markFileTabSaved: markFileTabSavedCommand,
      refreshFileTabFromDisk: refreshFileTabFromDiskCommand,
      refreshDiffTabContent: refreshDiffTabContentCommand,
      refreshWorkspaceGitChanges: refreshWorkspaceGitChangesCommand,
    }),
    [],
  );
}
