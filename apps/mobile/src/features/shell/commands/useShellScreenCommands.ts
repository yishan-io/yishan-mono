import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { useShellMutations } from "../commands/useShellMutations";
import type { useShellSheets } from "../hooks/useShellSheets";
import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { TerminalMap } from "../state/shell.types";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import { useShellCreateTerminalAction } from "./useShellCreateTerminalAction";
import { useShellMenuActions } from "./useShellMenuActions";
import { useShellNavigationCommands } from "./useShellNavigationCommands";
import { useShellPaneTabActions } from "./useShellPaneTabActions";
import { useShellQuickActionCommands } from "./useShellQuickActionCommands";
import { useShellRecoveryCommands } from "./useShellRecoveryCommands";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseShellScreenCommandsInput = {
  closeDrawer: () => void;
  dismissDrawer: () => void;
  mutations: ReturnType<typeof useShellMutations>;
  paneTabSheet: {
    close: () => void;
    isOpen: boolean;
    open: () => void;
  };
  screenContext: ShellScreenContext;
  sheets: ReturnType<typeof useShellSheets>;
  shell: ShellState;
  t: Translate;
  terminalMessages: ShellTerminalMessages;
};

export function useShellScreenCommands({
  closeDrawer,
  dismissDrawer,
  mutations,
  paneTabSheet,
  screenContext,
  sheets,
  shell,
  t,
  terminalMessages,
}: UseShellScreenCommandsInput) {
  const pathname = usePathname();
  const router = useRouter();
  const lastAutoRefreshedWorkspaceKeyRef = useRef<string | null>(null);

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
    currentOrganizationId: screenContext.currentOrganizationId,
    mutations,
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
  const terminalsById = useMemo<TerminalMap>(
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

  useEffect(() => {
    const selectedWorkspaceContext = screenContext.selectedWorkspaceContext;
    if (!selectedWorkspaceContext) {
      lastAutoRefreshedWorkspaceKeyRef.current = null;
      return;
    }

    const workspaceKey = [
      selectedWorkspaceContext.organizationId,
      selectedWorkspaceContext.projectId,
      selectedWorkspaceContext.workspaceId,
    ].join(":");
    if (lastAutoRefreshedWorkspaceKeyRef.current === workspaceKey) {
      return;
    }

    lastAutoRefreshedWorkspaceKeyRef.current = workspaceKey;
    void terminalMessages.refreshSessionSync();
  }, [screenContext.selectedWorkspaceContext, terminalMessages]);

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

  return {
    agentQuickActions,
    browserOpenHandler,
    closePaneTab,
    createTerminalHandler,
    openProfileControls: navigationCommands.openProfileControls,
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
  };
}
