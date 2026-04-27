import { collectSessionIdsToCloseAllTabs, collectSessionIdsToCloseOtherTabs } from "../helpers/tabHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { chatStore } from "../store/chatStore";
import type { TabStoreState } from "../store/tabStore";
import { tabStore } from "../store/tabStore";
import type { OpenWorkspaceTabInput } from "../store/types";

type TabStoreFacade = typeof tabStore & {
  getState?: () => TabStoreState;
};

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

/** Reads tab store state for both real Zustand stores and selector-only test doubles. */
function readTabStoreState(): TabStoreState {
  const facade = tabStore as TabStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (tabStore as unknown as (selector: (state: TabStoreState) => TabStoreState) => TabStoreState)(
    (state) => state,
  );
}

/**
 * Closes terminal sessions for terminal tabs in the provided tab list.
 */
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
      .catch(() => {
        return;
      });
  }
}

/** Creates one tab optimistically, then initializes its backend chat session. */
export async function createTab(input?: { workspaceId?: string }): Promise<void> {
  const created = await readTabStoreState().createTab(input);
  if (!created) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const ensured = await client.chat.ensureWorkspaceChatSession({
      workspaceId: created.workspaceId,
      sessionId: created.tabId,
      title: created.title,
    });
    readTabStoreState().resolveSessionTab(created.tabId, ensured.sessionId);
  } catch (error) {
    console.error("Failed to create chat session for new tab", error);
    readTabStoreState().failSessionTabInit(created.tabId);
  }
}

/** Closes one tab and requests backend session closure when needed. */
export function closeTab(tabId: string): void {
  const snapshot = readTabStoreState();
  const tab = snapshot.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return;
  }

  if (tab?.kind === "session" && tab.data.sessionId) {
    const sessionId = tab.data.sessionId;
    void getDaemonClient()
      .then((client) => {
        return client.chat.closeAgentSession({ sessionId });
      })
      .catch(() => {
        return;
      });
  }
  if (tab.kind === "terminal") {
    closeTerminalSessionsForTabs([tab]);
  }
  snapshot.closeTab(tabId);
  chatStore.getState().removeTabData([tabId]);
}

/** Closes sibling tabs for one workspace and closes associated backend sessions. */
export function closeOtherTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = snapshot.tabs.filter((tab) => tab.workspaceId === target.workspaceId && tab.id !== tabId);
  const removedTerminalTabs = removedTabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const removedTabIds = removedTabs.map((tab) => tab.id);

  for (const sessionId of collectSessionIdsToCloseOtherTabs(snapshot.tabs, tabId)) {
    void getDaemonClient()
      .then((client) => {
        return client.chat.closeAgentSession({ sessionId });
      })
      .catch(() => {
        return;
      });
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  snapshot.closeOtherTabs(tabId);
  if (removedTabIds.length > 0) {
    chatStore.getState().removeTabData(removedTabIds);
  }
}

/** Closes all tabs for one workspace and closes associated backend sessions. */
export function closeAllTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = snapshot.tabs.filter((tab) => tab.workspaceId === target.workspaceId);
  const removedTerminalTabs = removedTabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const removedTabIds = removedTabs.map((tab) => tab.id);

  for (const sessionId of collectSessionIdsToCloseAllTabs(snapshot.tabs, tabId)) {
    void getDaemonClient()
      .then((client) => {
        return client.chat.closeAgentSession({ sessionId });
      })
      .catch(() => {
        return;
      });
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  snapshot.closeAllTabs(tabId);
  if (removedTabIds.length > 0) {
    chatStore.getState().removeTabData(removedTabIds);
  }
}

/** Sets one selected tab id in tab store state. */
export function setSelectedTab(tabId: string) {
  readTabStoreState().setSelectedTabId(tabId);
}

/** Opens one tab from one normalized tab input payload. */
export function openTab(input: OpenWorkspaceTabInput) {
  readTabStoreState().openTab(input);
}

/** Toggles pinned state for one tab id. */
export function toggleTabPinned(tabId: string) {
  readTabStoreState().toggleTabPinned(tabId);
}

/** Reorders one tab relative to one target tab position. */
export function reorderTab(draggedTabId: string, targetTabId: string, position: "before" | "after") {
  readTabStoreState().reorderTab(draggedTabId, targetTabId, position);
}

/** Renames one tab title. */
export function renameTab(tabId: string, title: string) {
  readTabStoreState().renameTab(tabId, title);
}

/** Updates one file tab content and dirtiness state. */
export function updateFileTabContent(tabId: string, content: string) {
  readTabStoreState().updateFileTabContent(tabId, content);
}

/** Marks one file tab saved by syncing saved content snapshot. */
export function markFileTabSaved(tabId: string) {
  readTabStoreState().markFileTabSaved(tabId);
}
