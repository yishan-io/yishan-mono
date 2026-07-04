import { useMemo } from "react";

import {
  resolveAggregateWorkspaceIndicator,
  useNotificationRuntime,
} from "@/features/notifications/notification-runtime-context";
import type { useShellMutations } from "../commands/useShellMutations";
import { useShellScreenCommands } from "../commands/useShellScreenCommands";
import type { useShellSheets } from "../hooks/useShellSheets";
import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type {
  ShellChatModel,
  ShellDrawerPanelModel,
  ShellDrawerTopBarModel,
  ShellFocusPanePreviewContext,
} from "../shell-screen.types";
import type { ShellState } from "../state/useShellState";
import { formatTerminalDisplayLabel, workspaceDisplayName } from "./shell-labels";
import type { ShellScreenContext } from "./useShellScreenContext";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseShellScreenModelInput = {
  closeDrawer: () => void;
  dismissDrawer: () => void;
  mutations: ReturnType<typeof useShellMutations>;
  onDismissKeyboard: () => void;
  sheets: ReturnType<typeof useShellSheets>;
  shell: ShellState;
  paneTabSheet: {
    close: () => void;
    isOpen: boolean;
    open: () => void;
  };
  t: Translate;
  terminalMessages: ShellTerminalMessages;
  screenContext: ShellScreenContext;
};

export function useShellScreenModel({
  closeDrawer,
  dismissDrawer,
  mutations,
  onDismissKeyboard,
  sheets,
  shell,
  paneTabSheet,
  t,
  terminalMessages,
  screenContext,
}: UseShellScreenModelInput) {
  const { workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId } = useNotificationRuntime();
  const {
    agentQuickActions,
    browserOpenHandler,
    closePaneTab,
    createTerminalHandler,
    openProfileControls,
    onOpenProjectCreate,
    openChangesHandler,
    openFilesHandler,
    openPaneTabSheet,
    openProjectMenu,
    openPullRequestsHandler,
    openQuickActions,
    openWorkspaceMenu,
    projectMenuActions,
    refreshSessionsHandler,
    refreshWorkspaceTreeHandler,
    renameTerminal,
    retryProjects,
    selectOrganization,
    terminalsById,
    workspaceMenuActions,
  } = useShellScreenCommands({
    closeDrawer,
    dismissDrawer,
    mutations,
    onDismissKeyboard,
    paneTabSheet,
    screenContext,
    sheets,
    shell,
    t,
    terminalMessages,
  });

  const topBarTitle =
    screenContext.selectedProjectName ??
    screenContext.currentOrganization?.name ??
    t("shell.organizationFallbackTitle");
  const topBarSubtitle = screenContext.selectedWorkspace
    ? workspaceDisplayName(screenContext.selectedWorkspace, t)
    : (screenContext.selectedNode?.name ?? screenContext.currentNode?.name ?? t("shell.overview"));
  const topBarSubtitleStatus = screenContext.selectedWorkspace
    ? {
        workspaceId: screenContext.selectedWorkspace.id,
        workspaceKind: screenContext.selectedWorkspace.kind,
      }
    : null;
  const topBarAggregateIndicator = useMemo(
    () =>
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId,
        workspaceUnreadToneByWorkspaceId,
      }),
    [workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId],
  );

  const drawerPanel: ShellDrawerPanelModel = {
    currentNodes: screenContext.currentNodes,
    currentOrganizationId: screenContext.currentOrganizationId,
    currentOrganizationName: screenContext.currentOrganization?.name ?? t("shell.organizationFallbackTitle"),
    currentProjects: screenContext.currentProjects,
    isProjectsError: screenContext.currentOrgProjectsQuery.isError,
    isProjectsLoading: screenContext.currentOrgProjectsQuery.isLoading,
    onOpenProfileControls: openProfileControls,
    onOpenOrganizationSelector: () => {
      onDismissKeyboard();
      sheets.openOrgSelector();
    },
    onOpenProjectMenu: openProjectMenu,
    onRefreshWorkspaceTree: refreshWorkspaceTreeHandler,
    onOpenWorkspaceMenu: openWorkspaceMenu,
    onRetryProjects: retryProjects,
    organizationCount: screenContext.organizations.length,
    refreshingWorkspaceTree:
      screenContext.currentOrgNodesQuery.isFetching || screenContext.currentOrgProjectsQuery.isFetching,
    selectedSelection: screenContext.selectedSelection,
    userAvatarUrl: screenContext.meAvatarUrl,
    userName: screenContext.meName,
    workspacesByProjectId: screenContext.workspacesByProjectId,
  };

  const drawerTopBar: ShellDrawerTopBarModel = {
    aggregateIndicator: topBarAggregateIndicator,
    onOpenBrowser: browserOpenHandler,
    onOpenQuickActions: openQuickActions,
    onRefreshSessions: refreshSessionsHandler,
    refreshingSessions: terminalMessages.isRefreshingSessionSync,
    sessionSyncError: terminalMessages.didRefreshSessionSyncFail,
    subtitle: topBarSubtitle,
    subtitleStatus: topBarSubtitleStatus,
    title: topBarTitle,
  };

  const focusPaneChat: ShellChatModel = {
    agentQuickActions,
    draft: screenContext.currentDraft,
    messages: screenContext.currentMessages,
    onCreateTerminal: createTerminalHandler,
    onDraftChange: (value) => terminalMessages.handleDraftChange(value, screenContext.selectedTerminal),
    onOpenChanges: openChangesHandler,
    onOpenFiles: openFilesHandler,
    onOpenPaneTabs: openPaneTabSheet,
    onOpenPullRequests: openPullRequestsHandler,
    onSend: (draft) => terminalMessages.handleSend(screenContext.selectedTerminal, draft),
    onTerminalInput: (data) => terminalMessages.handleTerminalInput(data, screenContext.selectedTerminal),
    onTerminalResize: (size) => terminalMessages.handleTerminalResize(size, screenContext.selectedTerminal),
    selectedTerminal: screenContext.selectedTerminal,
    selectedTerminalTitle: screenContext.selectedTerminal
      ? formatTerminalDisplayLabel(screenContext.selectedTerminal.label)
      : null,
    terminalOutput: screenContext.currentTerminalOutput,
    workspaceLocalPath: screenContext.selectedWorkspace?.localPath ?? null,
  };

  const focusPanePreviewContext: ShellFocusPanePreviewContext = {
    nodeId: screenContext.selectedWorkspace?.nodeId ?? screenContext.selectedTerminal?.nodeId ?? null,
    organizationId: screenContext.selectedWorkspaceContext?.organizationId ?? null,
    projectId: screenContext.selectedWorkspaceContext?.projectId ?? null,
    workspaceId: screenContext.selectedWorkspaceContext?.workspaceId ?? null,
  };

  return {
    agentQuickActions,
    closePaneTab,
    closePaneTabSheet: paneTabSheet.close,
    createTerminalHandler,
    isPaneTabSheetOpen: paneTabSheet.isOpen,
    drawerPanel,
    drawerTopBar,
    focusPaneChat,
    focusPanePreviewContext,
    onOpenProjectCreate,
    onSelectWorkspace: shell.selectWorkspace,
    openChangesHandler,
    openFilesHandler,
    openPullRequestsHandler,
    openQuickActions,
    openPaneTabSheet,
    projectMenuActions,
    renameTerminal,
    refreshSessionsHandler,
    selectOrganization,
    terminalsById,
    workspaceMenuActions,
  };
}

export type ShellScreenModel = ReturnType<typeof useShellScreenModel>;
