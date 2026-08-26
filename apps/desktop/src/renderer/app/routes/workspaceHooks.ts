import type { listActivePiSessions } from "@renderer/domains/agent";
import type { AgentChatRecoveryCoordinator } from "@renderer/domains/agent";
import { SYSTEM_FILE_MANAGER_APP_ID, type openEntryInExternalApp } from "@renderer/domains/files";
import type { refreshWorkspaceGitChanges } from "@renderer/domains/git";
import type { refreshProgressingLocalTaskCount, selectLocalTaskWorkspace } from "@renderer/domains/local-task";
import { projectStore } from "@renderer/domains/project";
import type { TerminalRecoveryCoordinator } from "@renderer/domains/terminal";
import type { listTerminalSessions, setActiveWorkspace } from "@renderer/domains/terminal";
import {
  type activateWorkspace,
  type closeTab,
  type openTab,
  popupStore,
  type setSelectedTab,
  tabStore,
  workbenchNavigationStore,
} from "@renderer/domains/workbench";
import {
  type deleteSelectedFileTreeEntry,
  resolveWorkspaceProjectId,
  type toggleLeftPaneVisibility,
  type toggleRightPaneVisibility,
  type undoFileTreeOperation,
  workspaceStore,
} from "@renderer/domains/workspace";
import { type RefObject, useEffect, useRef } from "react";
import { useLocation, type useNavigate } from "react-router-dom";
import type { loadWorkspaceSnapshot } from "../../app/commands/workspaceSnapshotFlow";
import { ACTIONS } from "../../events";
import { subscribeAppActionEvent } from "../../events";
import { isEditableActiveElement } from "../../shortcuts/editableTarget";
import { parseWorkspaceSessionNavigationPath } from "./workspaceNavigation";

/** The command surface the workspace route needs to compose (Desktop 11 Phase 46). */
export type WorkspaceViewCommands = {
  activateWorkspace: typeof activateWorkspace;
  toggleLeftPaneVisibility: typeof toggleLeftPaneVisibility;
  toggleRightPaneVisibility: typeof toggleRightPaneVisibility;
  deleteSelectedFileTreeEntry: typeof deleteSelectedFileTreeEntry;
  undoFileTreeOperation: typeof undoFileTreeOperation;
  selectTab: typeof setSelectedTab;
  closeTab: typeof closeTab;
  openTab: typeof openTab;
  listActivePiSessions: typeof listActivePiSessions;
  listTerminalSessions: typeof listTerminalSessions;
  setActiveWorkspace: typeof setActiveWorkspace;
  openEntryInExternalApp: typeof openEntryInExternalApp;
  refreshWorkspaceGitChanges: typeof refreshWorkspaceGitChanges;
  refreshProgressingLocalTaskCount: typeof refreshProgressingLocalTaskCount;
  selectLocalTaskWorkspace: typeof selectLocalTaskWorkspace;
  loadWorkspaceSnapshot: typeof loadWorkspaceSnapshot;
};

/** Subscribes global app actions and routes them to workspace-level commands. */
export function useWorkspaceAppActions(input: {
  cmd: WorkspaceViewCommands;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { cmd, navigate } = input;
  const location = useLocation();
  const isWorkspaceRouteRef = useRef(location.pathname === "/");
  isWorkspaceRouteRef.current = location.pathname === "/";

  useEffect(() => {
    return subscribeAppActionEvent((payload) => {
      if (payload.action !== ACTIONS.NAVIGATE && popupStore.getState().isPopupOpen) {
        return;
      }

      if (payload.action !== ACTIONS.NAVIGATE && !isWorkspaceRouteRef.current) {
        return;
      }

      if (payload.action === ACTIONS.NAVIGATE) {
        const targetPath = payload.path.trim();
        if (!targetPath) {
          return;
        }
        const { workspaceId, sessionId, tabId } = parseWorkspaceSessionNavigationPath(targetPath);
        if (workspaceId) {
          const storeState = workspaceStore.getState();
          const workspace = storeState.workspaces.find((item) => item.id === workspaceId);
          cmd.activateWorkspace({
            workspaceId,
            projectId: workspace ? resolveWorkspaceProjectId(workspace) : undefined,
          });

          if (tabId) {
            const tab = tabStore.getState().tabs.find((item) => item.workspaceId === workspaceId && item.id === tabId);
            if (tab) {
              cmd.selectTab(tab.id);
            }
          }
        }

        navigate(targetPath);
        return;
      }

      if (payload.action === ACTIONS.CLOSE_TAB) {
        const selectedTabId = tabStore.getState().selectedTabId;
        if (selectedTabId) {
          cmd.closeTab(selectedTabId);
        }
        return;
      }

      if (payload.action === ACTIONS.OPEN_TERMINAL_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "terminal", title: "Terminal" });
        return;
      }

      if (payload.action === ACTIONS.OPEN_BROWSER_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!workspaceId) {
          return;
        }

        cmd.openTab({ workspaceId, kind: "browser", url: "" });
        return;
      }

      if (payload.action === ACTIONS.OPEN_AGENT_CHAT_TAB) {
        const workspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        const selectedWorkspace = workspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
        if (!workspaceId) {
          return;
        }

        cmd.openTab({
          workspaceId,
          kind: "agent-chat",
          title: "Agent Chat",
          cwd: selectedWorkspace?.worktreePath ?? undefined,
        });
        return;
      }

      if (payload.action === ACTIONS.TOGGLE_LEFT_PANE) {
        cmd.toggleLeftPaneVisibility();
        return;
      }

      if (payload.action === ACTIONS.TOGGLE_RIGHT_PANE) {
        cmd.toggleRightPaneVisibility();
        return;
      }

      if (payload.action === ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP) {
        const selectedWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
        if (!selectedWorkspaceId) {
          return;
        }
        const selectedWorkspace = workspaceStore
          .getState()
          .workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
        if (!selectedWorkspace?.worktreePath) {
          return;
        }

        void cmd.openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspace.worktreePath,
          appId: projectStore.getState().lastUsedExternalAppId ?? SYSTEM_FILE_MANAGER_APP_ID,
        });
        return;
      }

      if (isEditableActiveElement()) {
        return;
      }

      if (payload.action === ACTIONS.FILE_DELETE) {
        cmd.deleteSelectedFileTreeEntry();
        return;
      }

      if (payload.action === ACTIONS.FILE_UNDO) {
        cmd.undoFileTreeOperation();
        return;
      }
    });
  }, [cmd, navigate]);
}

/** Loads workspace data and restores terminal tabs persisted from previous sessions. */
export function useWorkspaceBootstrap(input: {
  cmd: WorkspaceViewCommands;
  terminalRecoveryCoordinator: TerminalRecoveryCoordinator;
  agentChatRecoveryCoordinator: AgentChatRecoveryCoordinator;
  selectedOrganizationId: string | undefined;
}) {
  const { cmd, terminalRecoveryCoordinator, agentChatRecoveryCoordinator, selectedOrganizationId } = input;

  useEffect(() => {
    if (!selectedOrganizationId?.trim()) {
      return;
    }

    let disposed = false;
    let unsubscribeTerminalPersist: (() => void) | undefined;
    let unsubscribeAgentChatPersist: (() => void) | undefined;

    const loadWorkspaceData = async () => {
      await cmd.loadWorkspaceSnapshot();
      if (disposed) {
        return;
      }
      await Promise.all([
        cmd.refreshProgressingLocalTaskCount(),
        cmd.selectLocalTaskWorkspace(workbenchNavigationStore.getState().activeWorkspaceId || null),
      ]);
      if (disposed) {
        return;
      }

      const restoredTerminalWorkspaceId = await terminalRecoveryCoordinator.restoreTerminalTabsFromDaemon({
        listTerminalSessions: () => cmd.listTerminalSessions({ includeExited: false }),
      });
      const restoredAgentChatResult = await agentChatRecoveryCoordinator.restoreAgentChatTabsFromDaemon({
        listActivePiSessions: () => cmd.listActivePiSessions(),
      });
      const restoredWorkspaceId =
        restoredAgentChatResult.selectedWorkspaceId ??
        restoredTerminalWorkspaceId ??
        restoredAgentChatResult.fallbackWorkspaceId;
      if (restoredWorkspaceId && restoredWorkspaceId !== workbenchNavigationStore.getState().activeWorkspaceId) {
        cmd.activateWorkspace({ workspaceId: restoredWorkspaceId });
      }

      if (!disposed) {
        unsubscribeTerminalPersist = terminalRecoveryCoordinator.startPersistingTerminalTabs();
        unsubscribeAgentChatPersist = agentChatRecoveryCoordinator.startPersistingAgentChatTabs();
      }
    };

    void loadWorkspaceData();

    return () => {
      disposed = true;
      unsubscribeTerminalPersist?.();
      unsubscribeAgentChatPersist?.();
    };
  }, [cmd, selectedOrganizationId, terminalRecoveryCoordinator, agentChatRecoveryCoordinator]);
}

/** Observes one container element and reports its width whenever it changes. */
export function useElementWidthObserver(input: {
  elementRef: RefObject<HTMLDivElement | null>;
  onWidthChange: (width: number) => void;
}) {
  const { elementRef, onWidthChange } = input;

  useEffect(() => {
    const root = elementRef.current;
    if (!root) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) {
        return;
      }
      onWidthChange(Math.max(0, entry.contentRect.width));
    });

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [elementRef, onWidthChange]);
}

/** Refreshes selected workspace git changes with queued re-run protection. */
export function useWorkspaceGitRefreshQueue(input: {
  cmd: WorkspaceViewCommands;
  selectedWorkspaceId: string;
  selectedWorkspaceWorktreePath: string | undefined;
  workspaceGitRefreshVersion: number;
}) {
  const { cmd, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion } = input;

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspaceWorktreePath) {
      return;
    }

    void workspaceGitRefreshVersion;

    let cancelled = false;
    let inFlight = false;
    let queued = false;

    const refreshWorkspaceGitChangesNow = async () => {
      if (cancelled || inFlight) {
        queued = true;
        return;
      }

      inFlight = true;

      try {
        await cmd.refreshWorkspaceGitChanges(selectedWorkspaceId);
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void refreshWorkspaceGitChangesNow();
        }
      }
    };

    void refreshWorkspaceGitChangesNow();

    return () => {
      cancelled = true;
    };
  }, [cmd, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);
}
