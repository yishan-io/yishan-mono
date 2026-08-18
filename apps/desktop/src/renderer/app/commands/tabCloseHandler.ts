import { closeAllTabs, closeOtherTabs, closeTab, tabStore } from "@renderer/domains/workbench";
import type { WorkbenchTab } from "@renderer/domains/workbench";
/**
 * App Tab-close handler (desktop6-adjust.md W5 task 10-11).
 *
 * UI composition code — not a Flow. Owns resource-specific cleanup when a
 * Workbench Tab is closed, then removes the Tab through the Workbench
 * remove-Tab command. Workbench Commands stay presentation-only.
 *
 * Command direction:
 *   Workbench Tab UI
 *     -> App Tab-close handler
 *         -> Agent, Terminal, Files, or Git cleanup Command
 *         -> Workbench remove-Tab Command
 */
import { clearAgentChatComposerFocus } from "../../events/agentChatComposerFocus";
import { stopPiSession } from "../../domains/agent/commands/agentChatCommands";
import { clearTerminalAgentStatus } from "../../domains/agent/commands/agentSessionLifecycle";
import { removeTabData } from "../../domains/agent/state/chatActions";
import { removeFileTabContent } from "../../domains/files/commands/fileTabContentCommands";
import { removeDiffTabContent } from "../../domains/git/commands/diffTabContentCommands";
import type { CloseTabOptions } from "../../domains/workbench/state/tabStore";
import { enqueueWorkspaceErrorNotice } from "../../domains/workspace/state/workspaceActions";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { recordExplicitlyClosedTerminalTabId } from "../../helpers/terminalCloseTombstones";
import { getDaemonClient } from "../../rpc/rpcTransport";

type TerminalTab = Extract<WorkbenchTab, { kind: "terminal" }>;
type AgentChatTab = Extract<WorkbenchTab, { kind: "agent-chat" }>;

/** Releases agent-chat sessions for tabs that are being closed. */
function stopAgentChatSessionsForTabs(tabs: AgentChatTab[]): void {
  for (const tab of tabs) {
    clearAgentChatComposerFocus(tab.id);
    // fire-and-forget: tab closure must not wait for daemon session cleanup.
    void stopPiSession(tab.id).catch(() => {});
  }
}

/** Closes terminal sessions for terminal tabs in the provided tab list. */
function closeTerminalSessionsForTabs(tabs: TerminalTab[]): void {
  for (const tab of tabs) {
    const sessionId = tab.data.sessionId?.trim();
    if (!sessionId) {
      continue;
    }

    void getDaemonClient()
      .then((client) => {
        return client.terminal.closeSession({ sessionId });
      })
      .catch((error) => {
        const message = getErrorMessage(error);
        enqueueWorkspaceErrorNotice({
          title: "Failed to close terminal session",
          message: `Could not clean up terminal session ${sessionId}: ${message}`,
        });
      });
  }
}

/** Releases module-owned tab payloads (file/diff content) with the tab. */
function removeTabContentStores(tabIds: string[]): void {
  if (tabIds.length === 0) {
    return;
  }
  removeFileTabContent(tabIds);
  removeDiffTabContent(tabIds);
}

/** Releases product resources for one tab, then removes it via Workbench. */
export function closeTabWithCleanup(tabId: string, options?: CloseTabOptions): void {
  const tab = tabStore.getState().tabs.find((tab) => tab.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.kind === "agent-chat") {
    clearAgentChatComposerFocus(tab.id);
    void stopPiSession(tab.id).catch(() => {});
  }
  if (tab.kind === "terminal") {
    recordExplicitlyClosedTerminalTabId(tab.id);
    clearTerminalAgentStatus(tab.id);
    closeTerminalSessionsForTabs([tab]);
  }
  removeTabData([tabId]);
  removeTabContentStores([tabId]);
  closeTab(tabId, options);
}

/** Releases product resources for unpinned sibling tabs, then removes them via Workbench. */
export function closeOtherTabsWithCleanup(tabId: string): void {
  const tabs = tabStore.getState().tabs;
  const target = tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = tabs.filter((tab) => tab.workspaceId === target.workspaceId && tab.id !== tabId && !tab.pinned);
  const removedTerminalTabs = removedTabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const removedAgentChatTabs = removedTabs.filter((tab): tab is AgentChatTab => tab.kind === "agent-chat");
  const removedTabIds = removedTabs.map((tab) => tab.id);

  for (const removedTerminalTab of removedTerminalTabs) {
    recordExplicitlyClosedTerminalTabId(removedTerminalTab.id);
    clearTerminalAgentStatus(removedTerminalTab.id);
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  stopAgentChatSessionsForTabs(removedAgentChatTabs);
  if (removedTabIds.length > 0) {
    removeTabData(removedTabIds);
    removeTabContentStores(removedTabIds);
  }
  closeOtherTabs(tabId);
}

/** Releases product resources for all unpinned workspace tabs, then removes them via Workbench. */
export function closeAllTabsWithCleanup(tabId: string): void {
  const tabs = tabStore.getState().tabs;
  const target = tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = tabs.filter((tab) => tab.workspaceId === target.workspaceId && !tab.pinned);
  const removedTerminalTabs = removedTabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const removedAgentChatTabs = removedTabs.filter((tab): tab is AgentChatTab => tab.kind === "agent-chat");
  const removedTabIds = removedTabs.map((tab) => tab.id);

  for (const removedTerminalTab of removedTerminalTabs) {
    recordExplicitlyClosedTerminalTabId(removedTerminalTab.id);
    clearTerminalAgentStatus(removedTerminalTab.id);
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  stopAgentChatSessionsForTabs(removedAgentChatTabs);
  if (removedTabIds.length > 0) {
    removeTabData(removedTabIds);
    removeTabContentStores(removedTabIds);
  }
  closeAllTabs(tabId);
}
