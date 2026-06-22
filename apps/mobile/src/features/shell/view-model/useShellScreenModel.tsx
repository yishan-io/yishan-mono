import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";

import {
  resolveAggregateWorkspaceIndicator,
  useNotificationRuntime,
} from "@/features/notifications/notification-runtime-context";
import { useShellCreateTerminalAction } from "../commands/useShellCreateTerminalAction";
import { useShellMenuActions } from "../commands/useShellMenuActions";
import type { useShellMutations } from "../commands/useShellMutations";
import { useShellNavigationCommands } from "../commands/useShellNavigationCommands";
import { useShellPaneTabActions } from "../commands/useShellPaneTabActions";
import { useShellQuickActionCommands } from "../commands/useShellQuickActionCommands";
import { useShellRecoveryCommands } from "../commands/useShellRecoveryCommands";
import type { ShellChatModel } from "../components/ShellChatSurface";
import type { ShellDrawerPanelModel, ShellDrawerTopBarModel } from "../components/ShellDrawer";
import type { ShellFocusPanePreviewContext } from "../components/ShellFocusPane";
import { WorkspaceStatusIndicator } from "../components/WorkspaceStatusIndicator";
import type { useShellSheets } from "../hooks/useShellSheets";
import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { ShellState } from "../state/useShellState";
import { formatTerminalDisplayLabel, workspaceDisplayName } from "./shell-labels";
import type { ShellScreenContext } from "./useShellScreenContext";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseShellScreenModelInput = {
  closeDrawer: () => void;
  dismissDrawer: () => void;
  mutations: ReturnType<typeof useShellMutations>;
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
  sheets,
  shell,
  paneTabSheet,
  t,
  terminalMessages,
  screenContext,
}: UseShellScreenModelInput) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId } = useNotificationRuntime();

  const navigationCommands = useShellNavigationCommands({
    closeDrawer,
    currentNodeId: screenContext.currentNodeId,
    currentOrganizationId: screenContext.currentOrganizationId,
    currentOrganizationName: screenContext.currentOrganization?.name ?? null,
    router,
  });
  const createTerminal = useShellCreateTerminalAction({
    closeDrawer,
    shell,
    t,
  });
  const { onOpenProjectCreate, projectMenuActions, workspaceMenuActions } = useShellMenuActions({
    createTerminal: (workspace) => createTerminal(workspace, { label: t("shell.newTerminal") }),
    currentOrganizationId: screenContext.currentOrganizationId,
    mutations,
    openWorkspaceBrowser: navigationCommands.openWorkspaceBrowser,
    sheets,
    t,
  });
  const {
    agentQuickActions,
    browserOpenHandler,
    createTerminalHandler,
    openChangesHandler,
    openFilesHandler,
    openPullRequestsHandler,
    refreshSessionsHandler,
  } = useShellQuickActionCommands({
    createTerminal,
    openWorkspaceBrowser: navigationCommands.openWorkspaceBrowser,
    shell,
    screenContext,
    t,
    terminalMessages,
  });
  const terminalsById = useMemo(
    () =>
      Object.fromEntries(
        Object.values(shell.terminalsByWorkspaceId)
          .flat()
          .map((terminal) => [terminal.id, terminal] as const),
      ),
    [shell.terminalsByWorkspaceId],
  );
  const { closePaneTab, renameTerminal } = useShellPaneTabActions({
    shell,
    terminalMessages,
    terminalsById,
  });

  useShellRecoveryCommands({
    dismissDrawer,
    pathname,
    router,
    shell,
    screenContext,
    t,
    terminalsById,
  });

  const hasQuickActions =
    !!createTerminalHandler ||
    !!openFilesHandler ||
    !!openChangesHandler ||
    !!openPullRequestsHandler ||
    !!agentQuickActions?.length;
  const canOpenQuickActionsFromTopBar = hasQuickActions && shell.paneTabs.length > 0;
  const openQuickActions = canOpenQuickActionsFromTopBar ? sheets.openQuickActions : null;
  const openPaneTabSheet = shell.paneTabs.length > 0 ? paneTabSheet.open : null;

  useEffect(() => {
    if (!canOpenQuickActionsFromTopBar && sheets.quickActionsOpen) {
      sheets.closeQuickActions();
    }
  }, [canOpenQuickActionsFromTopBar, sheets]);

  const topBarTitle =
    screenContext.selectedProjectName ??
    screenContext.currentOrganization?.name ??
    t("shell.organizationFallbackTitle");
  const topBarSubtitle = screenContext.selectedWorkspace
    ? workspaceDisplayName(screenContext.selectedWorkspace, t)
    : (screenContext.selectedNode?.name ?? screenContext.currentNode?.name ?? t("shell.overview"));
  const topBarSubtitleLeading = screenContext.selectedWorkspace ? (
    <WorkspaceStatusIndicator
      runningMode="icon"
      workspaceId={screenContext.selectedWorkspace.id}
      workspaceKind={screenContext.selectedWorkspace.kind}
      size={14}
      width={14}
    />
  ) : null;
  const topBarAggregateIndicator = useMemo(
    () =>
      resolveAggregateWorkspaceIndicator({
        workspaceAgentStatusByWorkspaceId,
        workspaceUnreadToneByWorkspaceId,
      }),
    [workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId],
  );

  const retryProjects = useCallback(() => {
    void screenContext.currentOrgProjectsQuery.refetch();
  }, [screenContext.currentOrgProjectsQuery]);

  const refreshWorkspaceTreeHandler = useCallback(() => {
    void Promise.all([screenContext.currentOrgNodesQuery.refetch(), screenContext.currentOrgProjectsQuery.refetch()]);
  }, [screenContext.currentOrgNodesQuery, screenContext.currentOrgProjectsQuery]);

  const selectOrganization = useCallback(
    (orgId: string) => {
      sheets.closeOrgSelector();
      shell.selectOrganization(orgId, { keepNavOpen: true });
    },
    [sheets, shell],
  );

  const openProjectMenu = useCallback(
    (project: Parameters<ReturnType<typeof useShellSheets>["openProjectMenu"]>[0]) => {
      sheets.openProjectMenu(project, screenContext.currentOrganizationId ?? null);
    },
    [screenContext.currentOrganizationId, sheets],
  );

  const openWorkspaceMenu = useCallback(
    (...args: Parameters<ReturnType<typeof useShellSheets>["openWorkspaceMenu"]>) => {
      sheets.openWorkspaceMenu(...args);
    },
    [sheets],
  );

  const drawerPanel: ShellDrawerPanelModel = {
    currentNodes: screenContext.currentNodes,
    currentOrganizationId: screenContext.currentOrganizationId,
    currentOrganizationName: screenContext.currentOrganization?.name ?? t("shell.organizationFallbackTitle"),
    currentProjects: screenContext.currentProjects,
    isProjectsError: screenContext.currentOrgProjectsQuery.isError,
    isProjectsLoading: screenContext.currentOrgProjectsQuery.isLoading,
    onOpenProfileControls: navigationCommands.openProfileControls,
    onOpenOrganizationSelector: sheets.openOrgSelector,
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
    subtitle: topBarSubtitle,
    subtitleLeading: topBarSubtitleLeading,
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
    onSend: () => terminalMessages.handleSend(screenContext.selectedTerminal),
    onTerminalInput: (data) => terminalMessages.handleTerminalInput(data, screenContext.selectedTerminal),
    onTerminalResize: (size) => terminalMessages.handleTerminalResize(size, screenContext.selectedTerminal),
    selectedTerminal: screenContext.selectedTerminal,
    selectedTerminalTitle: screenContext.selectedTerminal
      ? formatTerminalDisplayLabel(screenContext.selectedTerminal.label)
      : null,
    terminalOutput: screenContext.currentTerminalOutput,
  };

  const focusPanePreviewContext: ShellFocusPanePreviewContext = {
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
