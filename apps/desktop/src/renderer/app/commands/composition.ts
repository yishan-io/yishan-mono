import { tabStore } from "@renderer/domains/workbench";
import { renameAgentChatSessionByTab as renameAgentChatSessionByTabCommand } from "../../domains/agent/commands/agentChatCommands";
import { listActivePiSessions as listActivePiSessionsCommand } from "../../domains/agent/commands/agentChatSessionHistory";
import {
  listAgentDetectionStatuses as listAgentDetectionStatusesCommand,
  listAgentModels as listAgentModelsCommand,
} from "../../domains/agent/commands/agentCommands";
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
} from "../../domains/agent/commands/chatCommands";
import {
  listPiProviders as listPiProvidersCommand,
  openPiProviderLogin as openPiProviderLoginCommand,
  removePiProvider as removePiProviderCommand,
  savePiProvider as savePiProviderCommand,
} from "../../domains/agent/commands/piProviderCommands";
import {
  createFile as createFileCommand,
  createFolder as createFolderCommand,
  deleteEntry as deleteEntryCommand,
  listDetectedExternalAppIds as listDetectedExternalAppIdsCommand,
  listFiles as listFilesCommand,
  openEntryInExternalApp as openEntryInExternalAppCommand,
  readExternalClipboardSourcePaths as readExternalClipboardSourcePathsCommand,
  readFile as readFileCommand,
  renameEntry as renameEntryCommand,
  writeFile as writeFileCommand,
} from "../../domains/files/commands/fileCommands";
import {
  markFileTabSaved as markFileTabSavedCommand,
  refreshFileTabFromDisk as refreshFileTabFromDiskCommand,
  seedFileTabContent as seedFileTabContentCommand,
  updateFileTabContent as updateFileTabContentCommand,
} from "../../domains/files/commands/fileTabContentCommands";
import {
  createNewWhiteboard as createNewWhiteboardCommand,
  resolveNextWhiteboardPath as resolveNextWhiteboardPathCommand,
} from "../../domains/files/commands/whiteboardCommands";
import { createFileTabPlaceholder } from "../../domains/files/model/fileTabPlaceholder";
import {
  refreshDiffTabContent as refreshDiffTabContentCommand,
  seedDiffTabContent as seedDiffTabContentCommand,
} from "../../domains/git/commands/diffTabContentCommands";
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
} from "../../domains/git/commands/gitCommands";
import {
  listPullRequestHistory as listPullRequestHistoryCommand,
  refreshWorkspaceGitChanges as refreshWorkspaceGitChangesCommand,
  refreshWorkspacePullRequest as refreshWorkspacePullRequestCommand,
} from "../../domains/git/commands/gitProjectionCommands";
import { createDiffTabPlaceholder } from "../../domains/git/model/diffTabPlaceholder";
import { listOrgNodes as listOrgNodesCommand } from "../../domains/node/commands/nodeCommands";
import {
  getNotificationPreferences as getNotificationPreferencesCommand,
  playNotificationSound as playNotificationSoundCommand,
  previewNotification as previewNotificationCommand,
  updateNotificationPreferences as updateNotificationPreferencesCommand,
} from "../../domains/notification/commands/notificationCommands";
import { switchOrganization as switchOrganizationCommand } from "../../domains/organization/commands/orgCommands";
import {
  loadAllOverviewData as loadAllOverviewDataCommand,
  setOverviewProjectId as setOverviewProjectIdCommand,
  setOverviewTimeRange as setOverviewTimeRangeCommand,
} from "../../domains/overview/commands/overviewCommands";
import {
  createProject as createProjectCommand,
  deleteProject as deleteProjectCommand,
  inspectLocalProjectSource as inspectLocalProjectSourceCommand,
  loadWorkspaceSnapshot as loadWorkspaceSnapshotCommand,
  updateProjectConfig as updateProjectConfigCommand,
} from "../../domains/project/commands/projectCommands";
import type { WorkspaceProjectRecord } from "../../domains/project/model/projectTypes";
import {
  createScheduledJob as createScheduledJobCommand,
  deleteScheduledJob as deleteScheduledJobCommand,
  loadScheduledJobs as loadScheduledJobsCommand,
  pauseScheduledJob as pauseScheduledJobCommand,
  resumeScheduledJob as resumeScheduledJobCommand,
  runScheduledJobNow as runScheduledJobNowCommand,
  updateScheduledJob as updateScheduledJobCommand,
} from "../../domains/scheduled-job/commands/scheduledJobCommands";
import {
  getRemoteHealthStatus as getRemoteHealthStatusCommand,
  getSessionBootstrapData as getSessionBootstrapDataCommand,
  resetAuthExpiredState as resetAuthExpiredStateCommand,
} from "../../domains/session";
import { listCLIToolStatuses as listCLIToolStatusesCommand } from "../../domains/settings/commands/cliToolCommands";
import {
  closeTerminalSession as closeTerminalSessionCommand,
  consumeTerminalTabFocus as consumeTerminalTabFocusCommand,
  createTerminalSession as createTerminalSessionCommand,
  getTerminalResourceUsage as getTerminalResourceUsageCommand,
  killTerminalProcess as killTerminalProcessCommand,
  listDetectedPorts as listDetectedPortsCommand,
  listTerminalSessions as listTerminalSessionsCommand,
  readTerminalOutput as readTerminalOutputCommand,
  resizeTerminal as resizeTerminalCommand,
  retainOpenTerminalTabFocus as retainOpenTerminalTabFocusCommand,
  setActiveWorkspace as setActiveWorkspaceCommand,
  subscribeDetectedPorts as subscribeDetectedPortsCommand,
  subscribeTerminalOutput as subscribeTerminalOutputCommand,
  subscribeTerminalSessions as subscribeTerminalSessionsCommand,
  writeTerminalInput as writeTerminalInputCommand,
} from "../../domains/terminal/commands/terminalCommands";
import {
  activateProject as activateProjectCommand,
  activateWorkspace as activateWorkspaceCommand,
} from "../../domains/workbench/commands/navigationCommands";
import {
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
} from "../../domains/workbench/commands/tabCommands";
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
  setLastUsedExternalAppId as setLastUsedExternalAppIdCommand,
  toggleLeftPaneVisibility as toggleLeftPaneVisibilityCommand,
  toggleRightPaneVisibility as toggleRightPaneVisibilityCommand,
  undoFileTreeOperation as undoFileTreeOperationCommand,
} from "../../domains/workspace/commands/workspaceCommands";
import {
  appendBrowserHistory as appendBrowserHistoryCommand,
  checkAgentGlobalConfigExternalDirectoryPermission as checkAgentGlobalConfigExternalDirectoryPermissionCommand,
  ensureAgentGlobalConfigExternalDirectoryPermission as ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
  getDefaultWorktreeLocation as getDefaultWorktreeLocationCommand,
  loadBrowserHistory as loadBrowserHistoryCommand,
  logout as logoutCommand,
  openExternalUrl as openExternalUrlCommand,
  openLocalFolderDialog as openLocalFolderDialogCommand,
  toggleMainWindowMaximized as toggleMainWindowMaximizedCommand,
} from "./appCommands";

/**
 * Application command composition (Phase 12, desktop5.md).
 *
 * The global Commands object is split into per-feature command surfaces. Each
 * surface is independently requestable (useWorkspaceCommands etc.); the
 * composed `Commands` type is the union of all surfaces and remains the
 * compatibility entry for app-level consumers (e.g. the shortcut runtime).
 */

/** App-level commands (Electron host, auth, browser history). */
export type AppCommandSurface = {
  logout: typeof logoutCommand;
  openExternalUrl: typeof openExternalUrlCommand;
  openLocalFolderDialog: typeof openLocalFolderDialogCommand;
  getDefaultWorktreeLocation: typeof getDefaultWorktreeLocationCommand;
  checkAgentGlobalConfigExternalDirectoryPermission: typeof checkAgentGlobalConfigExternalDirectoryPermissionCommand;
  ensureAgentGlobalConfigExternalDirectoryPermission: typeof ensureAgentGlobalConfigExternalDirectoryPermissionCommand;
  toggleMainWindowMaximized: typeof toggleMainWindowMaximizedCommand;
  loadBrowserHistory: typeof loadBrowserHistoryCommand;
  appendBrowserHistory: typeof appendBrowserHistoryCommand;
};

/** Session feature command surface. */
export type SessionCommandSurface = {
  getSessionBootstrapData: typeof getSessionBootstrapDataCommand;
  getRemoteHealthStatus: typeof getRemoteHealthStatusCommand;
  resetAuthExpiredState: typeof resetAuthExpiredStateCommand;
};

/** Workspace feature command surface. */
export type WorkspaceCommandSurface = {
  activateProject: typeof activateProjectCommand;
  activateWorkspace: typeof activateWorkspaceCommand;
  setDisplayRepoIds: typeof setDisplayRepoIdsCommand;
  setLastUsedExternalAppId: typeof setLastUsedExternalAppIdCommand;
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

/** Node feature command surface. */
export type NodeCommandSurface = {
  listOrgNodes: typeof listOrgNodesCommand;
};

/** Notification feature command surface. */
export type NotificationCommandSurface = {
  getNotificationPreferences: typeof getNotificationPreferencesCommand;
  updateNotificationPreferences: typeof updateNotificationPreferencesCommand;
  previewNotification: typeof previewNotificationCommand;
  playNotificationSound: typeof playNotificationSoundCommand;
};

/** Organization feature command surface. */
export type OrganizationCommandSurface = {
  switchOrganization: typeof switchOrganizationCommand;
};

/** Overview feature command surface. */
export type OverviewCommandSurface = {
  loadAllOverviewData: typeof loadAllOverviewDataCommand;
  setOverviewTimeRange: typeof setOverviewTimeRangeCommand;
  setOverviewProjectId: typeof setOverviewProjectIdCommand;
};

/** ScheduledJob feature command surface. */
export type ScheduledJobCommandSurface = {
  loadScheduledJobs: typeof loadScheduledJobsCommand;
  createScheduledJob: typeof createScheduledJobCommand;
  updateScheduledJob: typeof updateScheduledJobCommand;
  deleteScheduledJob: typeof deleteScheduledJobCommand;
  pauseScheduledJob: typeof pauseScheduledJobCommand;
  resumeScheduledJob: typeof resumeScheduledJobCommand;
  runScheduledJobNow: typeof runScheduledJobNowCommand;
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

/** Project feature command surface. */
export type ProjectCommandSurface = {
  loadWorkspaceSnapshot: () => Promise<void>;
  inspectLocalProjectSource: typeof inspectLocalProjectSourceCommand;
  createProject: (input: {
    name: string;
    sourceTypeHint?: "unknown" | "git-local" | "git";
    path?: string;
    gitUrl?: string;
  }) => Promise<void>;
  deleteProject: (repoId: string) => Promise<void>;
  updateProjectConfig: typeof updateProjectConfigCommand;
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

/** Terminal feature command surface. */
export type TerminalCommandSurface = {
  createTerminalSession: typeof createTerminalSessionCommand;
  writeTerminalInput: typeof writeTerminalInputCommand;
  resizeTerminal: typeof resizeTerminalCommand;
  readTerminalOutput: typeof readTerminalOutputCommand;
  listDetectedPorts: typeof listDetectedPortsCommand;
  subscribeDetectedPorts: typeof subscribeDetectedPortsCommand;
  setActiveWorkspace: typeof setActiveWorkspaceCommand;
  getTerminalResourceUsage: typeof getTerminalResourceUsageCommand;
  listTerminalSessions: typeof listTerminalSessionsCommand;
  subscribeTerminalOutput: typeof subscribeTerminalOutputCommand;
  subscribeTerminalSessions: typeof subscribeTerminalSessionsCommand;
  closeTerminalSession: typeof closeTerminalSessionCommand;
  consumeTerminalTabFocus: typeof consumeTerminalTabFocusCommand;
  retainOpenTerminalTabFocus: typeof retainOpenTerminalTabFocusCommand;
  killTerminalProcess: typeof killTerminalProcessCommand;
};

/** Settings feature command surface. */
export type SettingsCommandSurface = {
  listCLIToolStatuses: typeof listCLIToolStatusesCommand;
};

/** The composed application command surface (all features). */
export type Commands = AppCommandSurface &
  SessionCommandSurface &
  WorkspaceCommandSurface &
  AgentCommandSurface &
  GitCommandSurface &
  NodeCommandSurface &
  NotificationCommandSurface &
  OrganizationCommandSurface &
  OverviewCommandSurface &
  ScheduledJobCommandSurface &
  FileCommandSurface &
  ProjectCommandSurface &
  WorkbenchCommandSurface &
  TerminalCommandSurface &
  SettingsCommandSurface;

export function createAppCommands(): AppCommandSurface {
  return {
    logout: logoutCommand,
    openExternalUrl: openExternalUrlCommand,
    openLocalFolderDialog: openLocalFolderDialogCommand,
    getDefaultWorktreeLocation: getDefaultWorktreeLocationCommand,
    checkAgentGlobalConfigExternalDirectoryPermission: checkAgentGlobalConfigExternalDirectoryPermissionCommand,
    ensureAgentGlobalConfigExternalDirectoryPermission: ensureAgentGlobalConfigExternalDirectoryPermissionCommand,
    toggleMainWindowMaximized: toggleMainWindowMaximizedCommand,
    loadBrowserHistory: loadBrowserHistoryCommand,
    appendBrowserHistory: appendBrowserHistoryCommand,
  };
}

export function createSessionCommands(): SessionCommandSurface {
  return {
    getSessionBootstrapData: getSessionBootstrapDataCommand,
    getRemoteHealthStatus: getRemoteHealthStatusCommand,
    resetAuthExpiredState: resetAuthExpiredStateCommand,
  };
}

export function createWorkspaceCommands(): WorkspaceCommandSurface {
  return {
    activateProject: activateProjectCommand,
    activateWorkspace: activateWorkspaceCommand,
    setDisplayRepoIds: setDisplayRepoIdsCommand,
    setLastUsedExternalAppId: setLastUsedExternalAppIdCommand,
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

export function createAgentCommands(): AgentCommandSurface {
  return {
    listAgentDetectionStatuses: listAgentDetectionStatusesCommand,
    listAgentModels: listAgentModelsCommand,
    listPiProviders: listPiProvidersCommand,
    savePiProvider: savePiProviderCommand,
    removePiProvider: removePiProviderCommand,
    openPiProviderLogin: openPiProviderLoginCommand,
    ensureChatSession: ensureChatSessionCommand,
    runChatPrompt: runChatPromptCommand,
    closeAgentSession: closeAgentSessionCommand,
    getChatMessages: getChatMessagesCommand,
    appendChatMessages: appendChatMessagesCommand,
    updateChatMessage: updateChatMessageCommand,
    setChatAvailableModels: setChatAvailableModelsCommand,
    setChatCurrentModel: setChatCurrentModelCommand,
    createWorkspaceChatEventHandler: createWorkspaceChatEventHandlerCommand,
    listActivePiSessions: listActivePiSessionsCommand,
  };
}

export function createGitCommands(): GitCommandSurface {
  return {
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
    refreshWorkspaceGitChanges: refreshWorkspaceGitChangesCommand,
    refreshWorkspacePullRequest: refreshWorkspacePullRequestCommand,
    listPullRequestHistory: listPullRequestHistoryCommand,
    refreshDiffTabContent: refreshDiffTabContentCommand,
  };
}

export function createNodeCommands(): NodeCommandSurface {
  return {
    listOrgNodes: listOrgNodesCommand,
  };
}

export function createNotificationCommands(): NotificationCommandSurface {
  return {
    getNotificationPreferences: getNotificationPreferencesCommand,
    updateNotificationPreferences: updateNotificationPreferencesCommand,
    previewNotification: previewNotificationCommand,
    playNotificationSound: playNotificationSoundCommand,
  };
}

export function createOrganizationCommands(): OrganizationCommandSurface {
  return {
    switchOrganization: switchOrganizationCommand,
  };
}

export function createOverviewCommands(): OverviewCommandSurface {
  return {
    loadAllOverviewData: loadAllOverviewDataCommand,
    setOverviewTimeRange: setOverviewTimeRangeCommand,
    setOverviewProjectId: setOverviewProjectIdCommand,
  };
}

export function createScheduledJobCommands(): ScheduledJobCommandSurface {
  return {
    loadScheduledJobs: loadScheduledJobsCommand,
    createScheduledJob: createScheduledJobCommand,
    updateScheduledJob: updateScheduledJobCommand,
    deleteScheduledJob: deleteScheduledJobCommand,
    pauseScheduledJob: pauseScheduledJobCommand,
    resumeScheduledJob: resumeScheduledJobCommand,
    runScheduledJobNow: runScheduledJobNowCommand,
  };
}

export function createFileCommands(): FileCommandSurface {
  return {
    listFiles: listFilesCommand,
    readFile: readFileCommand,
    writeFile: writeFileCommand,
    createFile: createFileCommand,
    createFolder: createFolderCommand,
    renameEntry: renameEntryCommand,
    deleteEntry: deleteEntryCommand,
    openEntryInExternalApp: openEntryInExternalAppCommand,
    listDetectedExternalAppIds: listDetectedExternalAppIdsCommand,
    readExternalClipboardSourcePaths: readExternalClipboardSourcePathsCommand,
    createNewWhiteboard: createNewWhiteboardCommand,
    resolveNextWhiteboardPath: resolveNextWhiteboardPathCommand,
    updateFileTabContent: updateFileTabContentCommand,
    markFileTabSaved: markFileTabSavedCommand,
    refreshFileTabFromDisk: refreshFileTabFromDiskCommand,
  };
}

export function createProjectCommands(): ProjectCommandSurface {
  return {
    loadWorkspaceSnapshot: loadWorkspaceSnapshotCommand,
    inspectLocalProjectSource: inspectLocalProjectSourceCommand,
    createProject: createProjectCommand,
    deleteProject: deleteProjectCommand,
    updateProjectConfig: updateProjectConfigCommand,
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

export function createTerminalCommands(): TerminalCommandSurface {
  return {
    createTerminalSession: createTerminalSessionCommand,
    writeTerminalInput: writeTerminalInputCommand,
    resizeTerminal: resizeTerminalCommand,
    readTerminalOutput: readTerminalOutputCommand,
    listDetectedPorts: listDetectedPortsCommand,
    subscribeDetectedPorts: subscribeDetectedPortsCommand,
    setActiveWorkspace: setActiveWorkspaceCommand,
    getTerminalResourceUsage: getTerminalResourceUsageCommand,
    listTerminalSessions: listTerminalSessionsCommand,
    subscribeTerminalOutput: subscribeTerminalOutputCommand,
    subscribeTerminalSessions: subscribeTerminalSessionsCommand,
    closeTerminalSession: closeTerminalSessionCommand,
    consumeTerminalTabFocus: consumeTerminalTabFocusCommand,
    retainOpenTerminalTabFocus: retainOpenTerminalTabFocusCommand,
    killTerminalProcess: killTerminalProcessCommand,
  };
}

export function createSettingsCommands(): SettingsCommandSurface {
  return {
    listCLIToolStatuses: listCLIToolStatusesCommand,
  };
}

/** Returns the composed UI-facing command surface (all features). */
export function createCommands(): Commands {
  return {
    ...createAppCommands(),
    ...createSessionCommands(),
    ...createWorkspaceCommands(),
    ...createAgentCommands(),
    ...createGitCommands(),
    ...createNodeCommands(),
    ...createNotificationCommands(),
    ...createOrganizationCommands(),
    ...createOverviewCommands(),
    ...createScheduledJobCommands(),
    ...createFileCommands(),
    ...createProjectCommands(),
    ...createWorkbenchCommands(),
    ...createTerminalCommands(),
    ...createSettingsCommands(),
  };
}
