import { useCallback } from "react";

import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import { markClosedTerminalId } from "../state/shell-closed-terminal-guard";
import type { TerminalMap } from "../state/shell.types";
import type { ShellState } from "../state/useShellState";
import { resolvePaneTabTerminalCloseEffect, resolveTerminalRenameTarget } from "./shell-pane-tab-ui-domain";

type UseShellPaneTabActionsInput = {
  shell: ShellState;
  terminalMessages: ShellTerminalMessages;
  terminalsById: TerminalMap;
};

export function useShellPaneTabActions({ shell, terminalMessages, terminalsById }: UseShellPaneTabActionsInput) {
  const closePaneTab = useCallback(
    (tabId: string) => {
      const closeEffect = resolvePaneTabTerminalCloseEffect(shell.paneTabs, terminalsById, tabId);
      if (closeEffect) {
        markClosedTerminalId(closeEffect.terminalId);
      }
      shell.closePaneTab(tabId);

      if (closeEffect) {
        terminalMessages.closeTerminal(closeEffect.terminal);
      }
    },
    [shell, terminalMessages, terminalsById],
  );

  const renameTerminal = useCallback(
    (terminalId: string, nextLabel: string) => {
      const renameTarget = resolveTerminalRenameTarget(terminalsById, terminalId);
      if (!renameTarget) {
        return;
      }

      shell.renameTerminal(renameTarget.workspaceId, renameTarget.terminalId, nextLabel);
    },
    [shell, terminalsById],
  );

  return {
    closePaneTab,
    renameTerminal,
  };
}
