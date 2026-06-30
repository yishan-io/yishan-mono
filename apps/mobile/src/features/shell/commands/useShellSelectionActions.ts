import type { ShellSelection, TerminalItem, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import type { Router } from "expo-router";
import type { WorkspaceContext } from "../state/shell-route-state";
import { useShellNavigationSelectionCommands } from "./useShellNavigationSelectionCommands";
import { useShellTerminalSelectionCommands } from "./useShellTerminalSelectionCommands";
import { useShellWorkspaceSelectionCommands } from "./useShellWorkspaceSelectionCommands";

type NavigationState = {
  setFoldedProjectIds: (updater: (current: string[]) => string[]) => void;
  setNavigationOrganizationId: (organizationId: string | null) => void;
  setNavOpen: (value: boolean) => void;
};

type StoredState = {
  setSelectedNodeIdByOrganization: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  setTerminalsByWorkspaceId: (
    updater: (current: Record<string, TerminalItem[]>) => Record<string, TerminalItem[]>,
  ) => void;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
};

type UseShellSelectionActionsInput = {
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  navigation: NavigationState;
  router: Router;
  setPendingSelection: (selection: ShellSelection | null) => void;
  storedState: StoredState;
  syncRouteForPaneStore: (context: WorkspaceContext, nextStoreState: WorkspacePaneStoreState) => void;
  writeWorkspacePaneStoreState: (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => void;
};

export function useShellSelectionActions({
  getWorkspacePaneStoreState,
  navigation,
  router,
  setPendingSelection,
  storedState,
  syncRouteForPaneStore,
  writeWorkspacePaneStoreState,
}: UseShellSelectionActionsInput) {
  const { selectNode, selectOrganization, syncWorkspaceSelectionState } = useShellNavigationSelectionCommands({
    navigation,
    router,
    setPendingSelection,
    storedState,
    syncRouteForPaneStore,
  });
  const { createTerminal, ensureTerminal } = useShellTerminalSelectionCommands({
    getWorkspacePaneStoreState,
    storedState,
    syncWorkspaceSelectionState,
    writeWorkspacePaneStoreState,
  });
  const { selectWorkspace, syncWorkspaceTerminalTabs } = useShellWorkspaceSelectionCommands({
    getWorkspacePaneStoreState,
    storedState,
    syncWorkspaceSelectionState,
    writeWorkspacePaneStoreState,
  });

  return {
    createTerminal,
    ensureTerminal,
    selectNode,
    selectOrganization,
    selectWorkspace,
    syncWorkspaceTerminalTabs,
  };
}
