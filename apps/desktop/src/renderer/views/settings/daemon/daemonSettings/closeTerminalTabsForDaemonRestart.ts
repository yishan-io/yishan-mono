import { closeTerminalSession } from "@renderer/commands/terminalCommands";
import { tabStore } from "@renderer/store/tabStore";

/** Closes all open terminal sessions and tabs before a daemon restart. */
export async function closeTerminalTabsForDaemonRestart() {
  const terminalTabs = tabStore.getState().tabs.filter((tab) => tab.kind === "terminal");
  const sessionIds = [
    ...new Set(
      terminalTabs
        .map((tab) => (tab.kind === "terminal" ? tab.data.sessionId?.trim() : undefined))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const closeErrors: string[] = [];
  for (const sessionId of sessionIds) {
    try {
      await closeTerminalSession({ sessionId });
    } catch (error) {
      closeErrors.push(sessionId);
      console.warn("[DaemonSettingsView] Failed to close terminal session", sessionId, error);
    }
  }

  if (terminalTabs.length > 0) {
    tabStore.getState().closeAllTerminalTabs();
  }

  return closeErrors;
}
