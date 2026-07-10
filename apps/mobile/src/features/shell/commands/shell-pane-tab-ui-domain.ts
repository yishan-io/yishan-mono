import type { ShellPaneTab, TerminalItem, TerminalMap } from "../state/shell.types";

export function resolvePaneTabTerminalCloseEffect(
  paneTabs: ShellPaneTab[],
  terminalsById: TerminalMap,
  tabId: string,
): { terminalId: string; terminal: TerminalItem | null } | null {
  const paneTab = paneTabs.find((tab) => tab.id === tabId);
  if (paneTab?.kind !== "terminal") {
    return null;
  }

  return {
    terminal: terminalsById[paneTab.terminalId] ?? null,
    terminalId: paneTab.terminalId,
  };
}

export function resolveTerminalRenameTarget(terminalsById: TerminalMap, terminalId: string) {
  const terminal = terminalsById[terminalId];
  if (!terminal) {
    return null;
  }

  return {
    terminalId: terminal.id,
    workspaceId: terminal.workspaceId,
  };
}
