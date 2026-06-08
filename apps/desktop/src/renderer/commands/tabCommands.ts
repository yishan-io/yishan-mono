import { getErrorMessage } from "../helpers/errorHelpers";
import { collectSessionIdsToCloseAllTabs, collectSessionIdsToCloseOtherTabs } from "../helpers/tabHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { chatStore } from "../store/chatStore";
import { splitPaneStore } from "../store/splitPaneStore";
import type { TabStoreState } from "../store/tabStore";
import { tabStore } from "../store/tabStore";
import type { OpenWorkspaceTabInput } from "../store/types";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../store/workspaceStore";

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
      .catch((error) => {
        const message = getErrorMessage(error);
        enqueueWorkspaceErrorNotice({
          title: "Failed to close terminal session",
          message: `Could not clean up terminal session ${sessionId}: ${message}`,
        });
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

/** Closes unpinned sibling tabs for one workspace and closes associated backend sessions. */
export function closeOtherTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = snapshot.tabs.filter(
    (tab) => tab.workspaceId === target.workspaceId && tab.id !== tabId && !tab.pinned,
  );
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

/** Closes all unpinned tabs for one workspace and closes associated backend sessions. */
export function closeAllTabs(tabId: string): void {
  const snapshot = readTabStoreState();
  const target = snapshot.tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }

  const removedTabs = snapshot.tabs.filter((tab) => tab.workspaceId === target.workspaceId && !tab.pinned);
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
  readTabStoreState().selectTab(tabId);
}

/** Opens one tab from one normalized tab input payload. */
export function openTab(input: OpenWorkspaceTabInput) {
  const workspaceId = input.workspaceId ?? workspaceStore.getState().selectedWorkspaceId;
  const activePane = splitPaneStore.getState().getActivePane(workspaceId);
  readTabStoreState().openTab(input, { activePaneTabIds: activePane?.tabIds });
}

/** Toggles pinned state for one tab id. */
export function toggleTabPinned(tabId: string) {
  readTabStoreState().toggleTabPinned(tabId);
}

/** Promotes a temporary tab to permanent (non-temporary) state. */
export function promoteTemporaryTab(tabId: string) {
  readTabStoreState().promoteTemporaryTab(tabId);
}

/** Reorders one tab relative to one target tab position. */
export function reorderTab(draggedTabId: string, targetTabId: string, position: "before" | "after") {
  readTabStoreState().reorderTab(draggedTabId, targetTabId, position);
}

/** Renames one tab title. */
export function renameTab(tabId: string, title: string, options?: { userRenamed?: boolean }) {
  readTabStoreState().renameTab(tabId, title, options);
}

/** Stores one browser tab favicon URL. */
export function setBrowserTabFaviconUrl(tabId: string, faviconUrl: string | undefined) {
  readTabStoreState().setBrowserTabFaviconUrl(tabId, faviconUrl);
}

/** Persists the current navigated URL on a browser tab. */
export function setBrowserTabUrl(tabId: string, url: string) {
  readTabStoreState().setBrowserTabUrl(tabId, url);
}

/** Applies a file-tree rename mapping to related open tabs. */
export function renameTabsForEntryRename(workspaceId: string, fromPath: string, toPath: string) {
  readTabStoreState().renameTabsForEntryRename(workspaceId, fromPath, toPath);
}

/** Updates one file tab content and dirtiness state. */
export function updateFileTabContent(tabId: string, content: string) {
  readTabStoreState().updateFileTabContent(tabId, content);
}

/** Marks one file tab saved by syncing saved content snapshot. */
export function markFileTabSaved(tabId: string) {
  readTabStoreState().markFileTabSaved(tabId);
}

/** Refreshes one non-dirty file tab from disk state. */
export function refreshFileTabFromDisk(input: { tabId: string; content: string; deleted: boolean }) {
  readTabStoreState().refreshFileTabFromDisk(input);
}

/** Refreshes one diff tab content in place. */
export function refreshDiffTabContent(input: { tabId: string; oldContent: string; newContent: string }) {
  readTabStoreState().refreshDiffTabContent(input);
}
