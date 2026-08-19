import {
  appendChatMessages as appendChatMessagesCommand,
  closeAgentSession as closeAgentSessionCommand,
  createWorkspaceChatEventHandler as createWorkspaceChatEventHandlerCommand,
  ensureChatSession as ensureChatSessionCommand,
  getChatMessages as getChatMessagesCommand,
  listActivePiSessions as listActivePiSessionsCommand,
  listAgentDetectionStatuses as listAgentDetectionStatusesCommand,
  listAgentModels as listAgentModelsCommand,
  listPiProviders as listPiProvidersCommand,
  openPiProviderLogin as openPiProviderLoginCommand,
  removePiProvider as removePiProviderCommand,
  renameAgentChatSessionByTab as renameAgentChatSessionByTabCommand,
  runChatPrompt as runChatPromptCommand,
  savePiProvider as savePiProviderCommand,
  setChatAvailableModels as setChatAvailableModelsCommand,
  setChatCurrentModel as setChatCurrentModelCommand,
  updateChatMessage as updateChatMessageCommand,
} from "@renderer/domains/agent";
import {
  createFile as createFileCommand,
  createFileTabPlaceholder,
  createFolder as createFolderCommand,
  createNewWhiteboard as createNewWhiteboardCommand,
  deleteEntry as deleteEntryCommand,
  listDetectedExternalAppIds as listDetectedExternalAppIdsCommand,
  listFiles as listFilesCommand,
  markFileTabSaved as markFileTabSavedCommand,
  openEntryInExternalApp as openEntryInExternalAppCommand,
  readExternalClipboardSourcePaths as readExternalClipboardSourcePathsCommand,
  readFile as readFileCommand,
  refreshFileTabFromDisk as refreshFileTabFromDiskCommand,
  renameEntry as renameEntryCommand,
  resolveNextWhiteboardPath as resolveNextWhiteboardPathCommand,
  seedFileTabContent as seedFileTabContentCommand,
  updateFileTabContent as updateFileTabContentCommand,
  writeFile as writeFileCommand,
} from "@renderer/domains/files";
import {
  commitGitChanges as commitGitChangesCommand,
  getGitAuthorName as getGitAuthorNameCommand,
  getGitBranchStatus as getGitBranchStatusCommand,
  listGitBranches as listGitBranchesCommand,
  listGitChanges as listGitChangesCommand,
  listGitCommitsToTarget as listGitCommitsToTargetCommand,
  listPullRequestHistory as listPullRequestHistoryCommand,
  publishGitBranch as publishGitBranchCommand,
  pushGitBranch as pushGitBranchCommand,
  readBranchComparisonDiff as readBranchComparisonDiffCommand,
  readCommitDiff as readCommitDiffCommand,
  readDiff as readDiffCommand,
  refreshDiffTabContent as refreshDiffTabContentCommand,
  refreshWorkspaceGitChanges as refreshWorkspaceGitChangesCommand,
  refreshWorkspacePullRequest as refreshWorkspacePullRequestCommand,
  revertGitChanges as revertGitChangesCommand,
  seedDiffTabContent as seedDiffTabContentCommand,
  trackGitChanges as trackGitChangesCommand,
  unstageGitChanges as unstageGitChangesCommand,
} from "@renderer/domains/git";
import {
  getNotificationPreferences as getNotificationPreferencesCommand,
  playNotificationSound as playNotificationSoundCommand,
  previewNotification as previewNotificationCommand,
  updateNotificationPreferences as updateNotificationPreferencesCommand,
} from "@renderer/domains/notification";
import {
  loadAllOverviewData as loadAllOverviewDataCommand,
  setOverviewProjectId as setOverviewProjectIdCommand,
  setOverviewTimeRange as setOverviewTimeRangeCommand,
} from "@renderer/domains/overview";
import {
  type WorkspaceProjectRecord,
  createProject as createProjectCommand,
  deleteProject as deleteProjectCommand,
  inspectLocalProjectSource as inspectLocalProjectSourceCommand,
  projectStore,
  updateProjectConfig as updateProjectConfigCommand,
} from "@renderer/domains/project";
import {
  createScheduledJob as createScheduledJobCommand,
  deleteScheduledJob as deleteScheduledJobCommand,
  loadScheduledJobs as loadScheduledJobsCommand,
  pauseScheduledJob as pauseScheduledJobCommand,
  resumeScheduledJob as resumeScheduledJobCommand,
  runScheduledJobNow as runScheduledJobNowCommand,
  updateScheduledJob as updateScheduledJobCommand,
} from "@renderer/domains/scheduled-job";
import { listCLIToolStatuses as listCLIToolStatusesCommand } from "@renderer/domains/settings";
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
} from "@renderer/domains/terminal";
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
import { listOrgNodes as listOrgNodesCommand } from "../../domains/node";
import { switchOrganization as switchOrganizationCommand } from "../../domains/organization";
import { getRemoteHealthStatus as getRemoteHealthStatusCommand, getSessionBootstrapData as getSessionBootstrapDataCommand, resetAuthExpiredState as resetAuthExpiredStateCommand } from "../../domains/session";
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
  AgentCommandSurface,
  AppCommandSurface,
  Commands,
  FileCommandSurface,
  GitCommandSurface,
  NodeCommandSurface,
  NotificationCommandSurface,
  OrganizationCommandSurface,
  OverviewCommandSurface,
  ProjectCommandSurface,
  ScheduledJobCommandSurface,
  SessionCommandSurface,
  SettingsCommandSurface,
  TerminalCommandSurface,
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
export type {
  AgentCommandSurface,
  AppCommandSurface,
  FileCommandSurface,
  GitCommandSurface,
  NodeCommandSurface,
  NotificationCommandSurface,
  OrganizationCommandSurface,
  OverviewCommandSurface,
  ProjectCommandSurface,
  ScheduledJobCommandSurface,
  SessionCommandSurface,
  SettingsCommandSurface,
  TerminalCommandSurface,
  WorkbenchCommandSurface,
  WorkspaceCommandSurface,
  Commands,
} from "./commandSurfaces";
