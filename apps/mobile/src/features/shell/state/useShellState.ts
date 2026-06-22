import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { useShellPaneCommands } from "../commands/useShellPaneCommands";
import { useShellSelectionActions } from "../commands/useShellSelectionActions";
import { useShellNavigationState } from "../hooks/useShellNavigationState";
import { useShellStoredState } from "../hooks/useShellStoredState";
import { type ShellParams, toWorkspaceContext } from "./shell-route-state";
import type { ShellPaneTab, ShellSelection, TerminalItem } from "./shell.types";
import { useShellPaneState } from "./useShellPaneState";
import { useShellRouteSelectionState } from "./useShellRouteSelectionState";
import { useShellStateMaintenance } from "./useShellStateMaintenance";

export type ShellState = {
  activePaneTab: ShellPaneTab | null;
  activeTerminalId: string | null;
  closeActiveTab: () => void;
  closePaneTab: (tabId: string) => void;
  closeWorkspacePaneTab: (workspaceId: string, tabId: string) => void;
  createTerminal: ReturnType<typeof useShellSelectionActions>["createTerminal"];
  dropProjectState: ReturnType<typeof useShellStateMaintenance>["dropProjectState"];
  dropWorkspaceState: ReturnType<typeof useShellStateMaintenance>["dropWorkspaceState"];
  ensureTerminal: ReturnType<typeof useShellSelectionActions>["ensureTerminal"];
  foldedProjectIds: string[];
  hasRestoredStoredState: boolean;
  isNavOpen: boolean;
  isScreenFocused: boolean;
  navigationOrganizationId: string | null;
  paneTabs: ShellPaneTab[];
  preview: ReturnType<typeof useShellPaneState>["preview"];
  recentTerminals: TerminalItem[];
  removeTerminal: ReturnType<typeof useShellStateMaintenance>["removeTerminal"];
  renameTerminal: ReturnType<typeof useShellStateMaintenance>["renameTerminal"];
  resetToShellHome: ReturnType<typeof useShellStateMaintenance>["resetToShellHome"];
  selectNode: ReturnType<typeof useShellSelectionActions>["selectNode"];
  selectOrganization: ReturnType<typeof useShellSelectionActions>["selectOrganization"];
  selection: ShellSelection;
  selectPaneTab: (tabId: string) => void;
  selectWorkspace: ReturnType<typeof useShellSelectionActions>["selectWorkspace"];
  selectedNodeIdByOrganization: Record<string, string>;
  setNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  syncWorkspaceTerminalTabs: ReturnType<typeof useShellSelectionActions>["syncWorkspaceTerminalTabs"];
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  toggleProjectFold: (projectId: string) => void;
  updateTerminal: (
    workspaceId: string,
    terminalId: string,
    updater: (terminal: TerminalItem) => TerminalItem | null,
  ) => void;
  upsertTerminal: (workspaceId: string, nextTerminal: TerminalItem) => void;
};

export function useShellState({ isScreenFocused = true }: { isScreenFocused?: boolean } = {}): ShellState {
  const router = useRouter();
  const params = useLocalSearchParams<ShellParams>();
  const { routePreview, selectedOrganizationId, selection, setPendingSelection } = useShellRouteSelectionState(params);
  const navigation = useShellNavigationState(selectedOrganizationId);
  const storedState = useShellStoredState();

  const currentWorkspaceContext = useMemo(() => toWorkspaceContext(selection), [selection]);
  const {
    activePaneTab,
    activeTerminalId,
    getWorkspacePaneStoreState,
    paneTabs,
    preview,
    writeWorkspacePaneStoreState,
  } = useShellPaneState({
    currentWorkspaceContext,
    isScreenFocused,
    routePreview,
    selection,
    storedState,
  });
  const { closeActiveTab, closePaneTab, closeWorkspacePaneTab, selectPaneTab, syncRouteForPaneStore } =
    useShellPaneCommands({
      activePaneTabId: activePaneTab?.id ?? null,
      currentWorkspaceContext,
      getWorkspacePaneStoreState,
      params,
      router,
      selection,
      setPendingSelection,
      writeWorkspacePaneStoreState,
    });

  const { createTerminal, ensureTerminal, selectNode, selectOrganization, selectWorkspace, syncWorkspaceTerminalTabs } =
    useShellSelectionActions({
      getWorkspacePaneStoreState,
      navigation,
      router,
      setPendingSelection,
      storedState,
      syncRouteForPaneStore,
      writeWorkspacePaneStoreState,
    });

  const { dropProjectState, dropWorkspaceState, recentTerminals, removeTerminal, renameTerminal, resetToShellHome } =
    useShellStateMaintenance({
      navigation,
      routerReplaceHome: () => {
        router.replace("/(app)/shell");
      },
      selection,
      setPendingSelection,
      storedState,
    });

  return {
    activeTerminalId,
    activePaneTab,
    closeActiveTab,
    closePaneTab,
    closeWorkspacePaneTab,
    createTerminal,
    ensureTerminal,
    dropProjectState,
    dropWorkspaceState,
    foldedProjectIds: navigation.foldedProjectIds,
    hasRestoredStoredState: storedState.hasRestoredStoredState,
    isScreenFocused,
    isNavOpen: navigation.isNavOpen,
    navigationOrganizationId: navigation.navigationOrganizationId,
    paneTabs,
    preview,
    recentTerminals,
    removeTerminal,
    resetToShellHome,
    renameTerminal,
    selectNode,
    selectOrganization,
    selection,
    selectPaneTab,
    selectWorkspace,
    selectedNodeIdByOrganization: storedState.selectedNodeIdByOrganization,
    syncWorkspaceTerminalTabs,
    terminalsByWorkspaceId: storedState.terminalsByWorkspaceId,
    upsertTerminal: storedState.upsertTerminal,
    updateTerminal: storedState.updateTerminal,
    setNavOpen: navigation.setNavOpen,
    toggleProjectFold: navigation.toggleProjectFold,
  };
}
