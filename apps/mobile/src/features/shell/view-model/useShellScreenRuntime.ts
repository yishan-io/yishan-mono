import { useEffect, useState } from "react";

import { useShellMutations } from "../commands/useShellMutations";
import { useShellDrawer } from "../hooks/useShellDrawer";
import { useShellSheets } from "../hooks/useShellSheets";
import { resetShellUiFocusState, setShellUiFocusState } from "../state/shellUiFocusStore";
import { useShellState } from "../state/useShellState";
import { useShellScreenContext } from "./useShellScreenContext";
import { useShellScreenModel } from "./useShellScreenModel";
import { useShellTerminalMessagesModel } from "./useShellTerminalMessagesModel";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellScreenRuntime({
  drawerWidth,
  isScreenFocused,
  onDismissKeyboard,
  t,
}: {
  drawerWidth: number;
  isScreenFocused: boolean;
  onDismissKeyboard: () => void;
  t: Translate;
}) {
  const shell = useShellState({ isScreenFocused });
  const [isPaneTabSheetOpen, setPaneTabSheetOpen] = useState(false);
  const drawer = useShellDrawer({
    drawerWidth,
    isNavOpen: shell.isNavOpen,
    onInteractionStart: onDismissKeyboard,
    setNavOpen: shell.setNavOpen,
  });
  const sheets = useShellSheets();
  const screenContext = useShellScreenContext({
    shell,
    t,
  });
  const terminalMessages = useShellTerminalMessagesModel(shell, screenContext.selectedWorkspaceLabel);

  const mutations = useShellMutations({
    onProjectDeleted: ({ organizationId, projectId, workspaceIds, workspaceNodeIdsByWorkspaceId }) => {
      const projectTerminals = Object.values(shell.terminalsByWorkspaceId)
        .flat()
        .filter((terminal) => terminal.orgId === organizationId && terminal.projectId === projectId);

      for (const terminal of projectTerminals) {
        terminalMessages.closeTerminal(terminal);
      }

      sheets.closeProjectMenu();
      shell.dropProjectState({ organizationId, projectId, workspaceIds, workspaceNodeIdsByWorkspaceId });
    },
    onWorkspaceClosed: ({ organizationId, workspace }) => {
      const workspaceTerminals = [...(shell.terminalsByWorkspaceId[workspace.id] ?? [])];
      for (const terminal of workspaceTerminals) {
        terminalMessages.closeTerminal(terminal);
      }

      sheets.closeWorkspaceMenu();
      shell.dropWorkspaceState({
        organizationId,
        projectId: workspace.projectId,
        workspaceId: workspace.id,
        workspaceNodeId: workspace.nodeId,
      });
    },
  });
  const screenModel = useShellScreenModel({
    closeDrawer: drawer.closeDrawer,
    dismissDrawer: drawer.dismissDrawer,
    mutations,
    onDismissKeyboard,
    sheets,
    shell,
    paneTabSheet: {
      close: () => setPaneTabSheetOpen(false),
      isOpen: isPaneTabSheetOpen,
      open: () => setPaneTabSheetOpen(true),
    },
    t,
    terminalMessages,
    screenContext,
  });

  useEffect(() => {
    setShellUiFocusState({
      hasBlockingOverlay:
        shell.isNavOpen ||
        screenModel.isPaneTabSheetOpen ||
        sheets.quickActionsOpen ||
        sheets.orgSelectorOpen ||
        !!sheets.projectCreateOrganizationId ||
        !!sheets.projectMenuProject ||
        !!sheets.workspaceCreateProject ||
        !!sheets.workspaceMenuContext,
      isDrawerOpen: shell.isNavOpen,
      isPaneTabSheetOpen: screenModel.isPaneTabSheetOpen,
    });

    return () => {
      resetShellUiFocusState();
    };
  }, [
    screenModel.isPaneTabSheetOpen,
    shell.isNavOpen,
    sheets.quickActionsOpen,
    sheets.orgSelectorOpen,
    sheets.projectCreateOrganizationId,
    sheets.projectMenuProject,
    sheets.workspaceCreateProject,
    sheets.workspaceMenuContext,
  ]);

  return {
    drawer,
    screenContext,
    screenModel,
    sheets,
    shell,
  };
}
