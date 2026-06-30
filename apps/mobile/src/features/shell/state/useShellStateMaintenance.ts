import { useCallback, useMemo } from "react";

import type { ShellNavigationState } from "../hooks/useShellNavigationState";
import type { ShellStoredState } from "../hooks/useShellStoredState";
import { clearClosedTerminalIds } from "./shell-closed-terminal-guard";
import {
  dropProjectStoredState,
  dropWorkspaceStoredState,
  listRecentTerminals,
} from "./shell-state-maintenance-domain";
import { persistShellStateCleanup } from "./shell-state-maintenance-persistence";
import { RECENT_TERMINALS_LIMIT } from "./shell.constants";
import type { ShellSelection } from "./shell.types";

export function useShellStateMaintenance({
  navigation,
  routerReplaceHome,
  selection,
  storedState,
  setPendingSelection,
}: {
  navigation: ShellNavigationState;
  routerReplaceHome: () => void;
  selection: ShellSelection;
  storedState: ShellStoredState;
  setPendingSelection: (selection: ShellSelection | null) => void;
}) {
  const resetToShellHome = useCallback(
    (organizationId?: string | null) => {
      if (organizationId) {
        navigation.setNavigationOrganizationId(organizationId);
      }

      setPendingSelection({ kind: "home" });
      routerReplaceHome();
    },
    [navigation, routerReplaceHome, setPendingSelection],
  );

  const stageShellHomeSelection = useCallback(
    (organizationId?: string | null) => {
      if (organizationId) {
        navigation.setNavigationOrganizationId(organizationId);
      }

      setPendingSelection({ kind: "home" });
    },
    [navigation, setPendingSelection],
  );

  const dropWorkspaceState = useCallback(
    ({
      organizationId,
      projectId,
      workspaceId,
    }: {
      organizationId?: string | null;
      projectId?: string | null;
      workspaceId: string;
    }) => {
      const {
        nextPaneLayoutByWorkspaceId,
        nextTerminalsByWorkspaceId,
        nextWorkspaceTabStateByWorkspaceId,
        workspaceTerminalIds,
      } = dropWorkspaceStoredState(storedState, selection, workspaceId);

      storedState.setTerminalsByWorkspaceId(nextTerminalsByWorkspaceId);
      storedState.setWorkspaceTabStateByWorkspaceId(nextWorkspaceTabStateByWorkspaceId);
      storedState.setPaneLayoutByWorkspaceId(nextPaneLayoutByWorkspaceId);

      clearClosedTerminalIds(workspaceTerminalIds);
      if (selection.kind !== "home" && selection.workspaceId === workspaceId) {
        stageShellHomeSelection(organizationId ?? selection.orgId);
      }

      void (async () => {
        await persistShellStateCleanup({
          nextPaneLayoutByWorkspaceId,
          nextTerminalsByWorkspaceId,
          nextWorkspaceTabStateByWorkspaceId,
          organizationId: organizationId ?? "",
          projectId: projectId ?? "",
          selectedNodeIdByOrganization: storedState.selectedNodeIdByOrganization,
          workspaceIds: [workspaceId],
        });

        if (selection.kind !== "home" && selection.workspaceId === workspaceId) {
          resetToShellHome(organizationId ?? selection.orgId);
        }
      })();
    },
    [resetToShellHome, selection, stageShellHomeSelection, storedState],
  );

  const dropProjectState = useCallback(
    ({
      organizationId,
      projectId,
      workspaceIds,
    }: {
      organizationId: string;
      projectId: string;
      workspaceIds: string[];
    }) => {
      const {
        nextPaneLayoutByWorkspaceId,
        nextTerminalsByWorkspaceId,
        nextWorkspaceTabStateByWorkspaceId,
        projectTerminalIds,
      } = dropProjectStoredState(storedState, selection, organizationId, projectId, workspaceIds);

      storedState.setTerminalsByWorkspaceId(nextTerminalsByWorkspaceId);
      storedState.setWorkspaceTabStateByWorkspaceId(nextWorkspaceTabStateByWorkspaceId);
      storedState.setPaneLayoutByWorkspaceId(nextPaneLayoutByWorkspaceId);

      clearClosedTerminalIds(projectTerminalIds);

      navigation.setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
      if (selection.kind !== "home" && selection.orgId === organizationId && selection.projectId === projectId) {
        stageShellHomeSelection(organizationId);
      }

      void (async () => {
        await persistShellStateCleanup({
          nextPaneLayoutByWorkspaceId,
          nextTerminalsByWorkspaceId,
          nextWorkspaceTabStateByWorkspaceId,
          organizationId,
          projectId,
          selectedNodeIdByOrganization: storedState.selectedNodeIdByOrganization,
          workspaceIds,
        });

        if (selection.kind !== "home" && selection.orgId === organizationId && selection.projectId === projectId) {
          resetToShellHome(organizationId);
        }
      })();
    },
    [navigation, resetToShellHome, selection, stageShellHomeSelection, storedState],
  );

  const recentTerminals = useMemo(
    () => listRecentTerminals(storedState.terminalsByWorkspaceId, RECENT_TERMINALS_LIMIT),
    [storedState.terminalsByWorkspaceId],
  );

  const renameTerminal = useCallback(
    (workspaceId: string, terminalId: string, nextLabel: string) => {
      const label = nextLabel.trim();
      if (!label) {
        return;
      }

      storedState.updateTerminal(workspaceId, terminalId, (terminal) => {
        if (terminal.label === label && terminal.userRenamed) {
          return terminal;
        }

        return {
          ...terminal,
          label,
          updatedAt: new Date().toISOString(),
          userRenamed: true,
        };
      });
    },
    [storedState],
  );

  const removeTerminal = useCallback(
    (workspaceId: string, terminalId: string) => {
      storedState.updateTerminal(workspaceId, terminalId, () => null);
    },
    [storedState],
  );

  return {
    dropProjectState,
    dropWorkspaceState,
    recentTerminals,
    removeTerminal,
    renameTerminal,
    resetToShellHome,
  };
}
