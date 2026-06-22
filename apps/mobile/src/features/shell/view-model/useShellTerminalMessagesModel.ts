import { useMemo } from "react";

import { useShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { ShellState } from "../state/useShellState";
import { readSelectedWorkspaceContext, readWorkspaceLabelFromPrimaryTerminal } from "./shell-screen-context-domain";

export function useShellTerminalMessagesModel(shell: ShellState) {
  const selectedWorkspaceContext = useMemo(() => {
    const workspaceContext = readSelectedWorkspaceContext(shell.selection);
    if (!workspaceContext) {
      return null;
    }

    return {
      id: workspaceContext.workspaceId,
      nodeId: (shell.terminalsByWorkspaceId[workspaceContext.workspaceId] ?? [])[0]?.nodeId ?? null,
      organizationId: workspaceContext.organizationId,
      projectId: workspaceContext.projectId,
    };
  }, [shell.selection, shell.terminalsByWorkspaceId]);

  const selectedWorkspaceLabel = useMemo(
    () =>
      selectedWorkspaceContext
        ? readWorkspaceLabelFromPrimaryTerminal(shell.terminalsByWorkspaceId, selectedWorkspaceContext.id)
        : null,
    [selectedWorkspaceContext, shell.terminalsByWorkspaceId],
  );

  return useShellTerminalMessages({
    hasRestoredStoredState: shell.hasRestoredStoredState,
    removeTerminal: shell.removeTerminal,
    selectedTerminalId: shell.activeTerminalId,
    selectedTerminalWorkspace: selectedWorkspaceContext,
    syncWorkspaceTerminalTabs: shell.syncWorkspaceTerminalTabs,
    terminalsByWorkspaceId: shell.terminalsByWorkspaceId,
    upsertTerminal: shell.upsertTerminal,
    updateTerminal: shell.updateTerminal,
    workspaceLabel: selectedWorkspaceLabel,
  });
}
