import { useShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { ShellState } from "../state/useShellState";

export function useShellTerminalMessagesModel(shell: ShellState) {
  return useShellTerminalMessages({
    hasRestoredStoredState: shell.hasRestoredStoredState,
    removeTerminal: shell.removeTerminal,
    selectedTerminalId: shell.selectedTerminal?.id ?? null,
    selectedTerminalWorkspace: shell.selectedTerminalWorkspace,
    syncWorkspaceTerminalTabs: shell.syncWorkspaceTerminalTabs,
    terminalsByWorkspaceId: shell.terminalsByWorkspaceId,
    upsertTerminal: shell.upsertTerminal,
    updateTerminal: shell.updateTerminal,
    workspaceLabel: shell.selectedWorkspaceLabel,
  });
}
