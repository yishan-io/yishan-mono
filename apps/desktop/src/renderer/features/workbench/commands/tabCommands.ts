import { clearAgentChatComposerFocus, requestNewAgentChatComposerFocus } from "../../../events/agentChatComposerFocus";
import { stopPiSession } from "../../../features/agent/commands/agentChatCommands";
import { clearTerminalAgentStatus } from "../../../features/agent/events/agentEventHandlers";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { collectSessionIdsToCloseAllTabs, collectSessionIdsToCloseOtherTabs } from "../../../helpers/tabHelpers";
import { recordExplicitlyClosedTerminalTabId } from "../../../helpers/terminalCloseTombstones";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { chatStore } from "../../../store/chatStore";
import { collectLeaves, findOppositePaneId, removeTabFromPane, splitRootPane } from "../../../store/split-pane";
import { splitPaneStore } from "../../../store/splitPaneStore";
import type { CloseTabOptions, TabStoreState } from "../../../store/tabStore";
import { tabStore } from "../../../store/tabStore";
import { terminalFocusStore } from "../../../store/terminalFocusStore";
import type { OpenWorkspaceTabInput } from "../../../store/types";
import { enqueueWorkspaceErrorNotice } from "../../../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { resolveChatFilePath } from "../../../commands/fileCommands";

type TabStoreFacade = typeof tabStore & {
  getState?: () => TabStoreState;
};

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;
type AgentChatTab = Extract<TabStoreState["tabs"][number], { kind: "agent-chat" }>;

/** Reads tab store state for both real Zustand stores and selector-only test doubles. */
export function readTabStoreState(): TabStoreState {
  const facade = tabStore as TabStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (tabStore as unknown as (selector: (state: TabStoreState) => TabStoreState) => TabStoreState)(
    (state) => state,
  );
}

/** Releases agent-chat sessions for tabs that are being closed in bulk. */
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

/**
 * Derives the tab that should remain selected after closing `tabId`, based on the
 * split-pane layout: the tab the surviving/active pane will select.
 *
 * Uses the pure `removeTabFromPane` so the command mirrors exactly what the pane
 * layer computes when it unregisters the tab (pane-local neighbor, or the
 * remaining pane's selection after a collapse). Returns undefined when there is
 * no layout or the tab is not placed in one yet (falls back to the neighbor rule).
 */
function resolvePreferredSelectionAfterClose(workspaceId: string, tabId: string): string | undefined {
  const layout = splitPaneStore.getState().layoutByWorkspaceId[workspaceId];
  if (!layout) {
    return undefined;
  }
  const nextLayout = removeTabFromPane(layout, tabId);
  if (!nextLayout) {
    return undefined;
  }
  const nextActivePane = collectLeaves(nextLayout.root).find((pane) => pane.id === nextLayout.activePaneId);
  return nextActivePane?.selectedTabId || undefined;
}

/** Closes one tab and requests backend session closure when needed. */
export function closeTab(tabId: string, options?: CloseTabOptions): void {
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
  if (tab.kind === "agent-chat") {
    clearAgentChatComposerFocus(tab.id);
    // fire-and-forget: tab closure must not wait for daemon session cleanup.
    void stopPiSession(tab.id).catch(() => {});
  }
  if (tab.kind === "terminal") {
    recordExplicitlyClosedTerminalTabId(tab.id);
    clearTerminalAgentStatus(tab.id);
    closeTerminalSessionsForTabs([tab]);
  }
  // Pane-aware preference: the ✕-button path passes the surviving pane's selected
  // tab explicitly (the tab is already unregistered by then); keyboard/menu paths
  // get it derived from the layout here. Without a preference, `closeTabState`
  // falls back to its workspace-wide neighbor rule.
  const preferredSelectedTabId =
    options?.preferredSelectedTabId ?? resolvePreferredSelectionAfterClose(tab.workspaceId, tabId);
  if (preferredSelectedTabId) {
    snapshot.closeTab(tabId, { preferredSelectedTabId });
  } else {
    snapshot.closeTab(tabId);
  }
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
  const removedAgentChatTabs = removedTabs.filter((tab): tab is AgentChatTab => tab.kind === "agent-chat");
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
  for (const removedTerminalTab of removedTerminalTabs) {
    recordExplicitlyClosedTerminalTabId(removedTerminalTab.id);
    clearTerminalAgentStatus(removedTerminalTab.id);
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  stopAgentChatSessionsForTabs(removedAgentChatTabs);
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
  const removedAgentChatTabs = removedTabs.filter((tab): tab is AgentChatTab => tab.kind === "agent-chat");
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
  for (const removedTerminalTab of removedTerminalTabs) {
    recordExplicitlyClosedTerminalTabId(removedTerminalTab.id);
    clearTerminalAgentStatus(removedTerminalTab.id);
  }
  closeTerminalSessionsForTabs(removedTerminalTabs);
  stopAgentChatSessionsForTabs(removedAgentChatTabs);
  snapshot.closeAllTabs(tabId);
  if (removedTabIds.length > 0) {
    chatStore.getState().removeTabData(removedTabIds);
  }
}

/** Sets one selected tab id in tab store state. */
export function setSelectedTab(tabId: string) {
  readTabStoreState().selectTab(tabId);
}

/** Requests focus on the next frame for an eligible tab created by the current open-tab operation. */
function requestFocusForNewTab(previousTabIds: Set<string>): void {
  const snapshot = readTabStoreState();
  const selectedTab = snapshot.tabs.find((tab) => tab.id === snapshot.selectedTabId);
  if (!selectedTab || previousTabIds.has(selectedTab.id)) {
    return;
  }

  const requestFocus =
    selectedTab.kind === "terminal"
      ? () => terminalFocusStore.getState().requestFocus(selectedTab.id)
      : selectedTab.kind === "agent-chat" && selectedTab.data.sessionView !== "subagent-detail"
        ? () => requestNewAgentChatComposerFocus(selectedTab.id)
        : undefined;
  if (!requestFocus) {
    return;
  }

  window.requestAnimationFrame(() => {
    const createdTabStillExists = readTabStoreState().tabs.some((tab) => tab.id === selectedTab.id);
    if (!createdTabStillExists) {
      return;
    }

    requestFocus();
  });
}

/** Opens one tab from one normalized tab input payload. */
export function openTab(input: OpenWorkspaceTabInput) {
  const snapshot = readTabStoreState();
  const previousTabIds = new Set(snapshot.tabs.map((tab) => tab.id));
  const workspaceId = input.workspaceId ?? workspaceStore.getState().selectedWorkspaceId;
  const activePane = splitPaneStore.getState().getActivePane(workspaceId);
  snapshot.openTab(input, { activePaneTabIds: activePane?.tabIds });
  requestFocusForNewTab(previousTabIds);
}

/**
 * Opens one file referenced from chat, resolving it to a real workspace file first.
 *
 * When the referenced path does not exist (agents sometimes emit unreal paths),
 * a best-effort search is attempted; if no unique real file is found the user is
 * notified instead of opening a tab with mock content.
 */
export async function openChatFileTab(input: {
  workspaceId: string;
  relativePath: string;
  oppositePane?: boolean;
}): Promise<void> {
  const resolved = await resolveChatFilePath({ workspaceId: input.workspaceId, relativePath: input.relativePath });
  if (resolved.status === "unavailable") {
    enqueueWorkspaceErrorNotice({
      title: "Unable to open file",
      message: `Could not load ${input.relativePath}. Please try again.`,
    });
    return;
  }
  if (resolved.status === "not-found") {
    enqueueWorkspaceErrorNotice({
      title: "File not found",
      message: `${input.relativePath} does not exist in this workspace.`,
    });
    return;
  }

  const tabInput = {
    kind: "file" as const,
    workspaceId: input.workspaceId,
    path: resolved.path,
    content: resolved.content,
  };
  if (input.oppositePane) {
    openTabInOppositePane(tabInput);
  } else {
    openTab(tabInput);
  }
}

/**
 * Opens a tab in the opposite pane (cmd+click behavior):
 * - If no split exists, creates a horizontal split and opens the tab in the new pane.
 * - If a split exists, opens the tab in the pane opposite to the current active one.
 *
 * The split pane layout is updated first, then the tab is opened.
 * The auto-registration in `WorkspaceSplitPaneView` picks up the correct target pane
 * because it reads the current `activePaneId` after the split is already in place.
 */
export function openTabInOppositePane(input: OpenWorkspaceTabInput): void {
  const workspaceId = input.workspaceId ?? workspaceStore.getState().selectedWorkspaceId;
  if (!workspaceId) {
    return;
  }

  // Step 1: Ensure the split exists and determine the target pane
  const layout = splitPaneStore.getState().layoutByWorkspaceId[workspaceId];

  if (layout) {
    const oppositeId = findOppositePaneId(layout.root, layout.activePaneId);
    if (oppositeId) {
      // Split exists — set active pane to the opposite one so the auto-registration
      // hooks in WorkspaceSplitPaneView pick the right pane
      splitPaneStore.getState().setActivePane(workspaceId, oppositeId);
    } else if (layout.root.kind === "leaf") {
      // No split yet — create one with the new pane as second (right/bottom)
      const next = splitRootPane(layout, "horizontal");
      if (!next) {
        // Fallback to normal open
        openTab(input);
        return;
      }
      splitPaneStore.setState({
        layoutByWorkspaceId: {
          ...splitPaneStore.getState().layoutByWorkspaceId,
          [workspaceId]: next,
        },
      });
    } else {
      // Fallback to normal open
      openTab(input);
      return;
    }
  } else {
    // Fallback to normal open
    openTab(input);
    return;
  }

  const activePane = splitPaneStore.getState().getActivePane(workspaceId);
  const previousTabIds = new Set(readTabStoreState().tabs.map((tab) => tab.id));

  // Step 2: Open the tab — WorkspaceSplitPaneView's auto-registration effect will
  // place it in the current active pane (which is now the target opposite pane)
  readTabStoreState().openTab(input, { activePaneTabIds: activePane?.tabIds });
  requestFocusForNewTab(previousTabIds);
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

/** Renames one tab title. For agent-chat tabs, also forwards the rename to the pi session. */
export function renameTab(tabId: string, title: string, options?: { userRenamed?: boolean }) {
  readTabStoreState().renameTab(tabId, title, options);

  // Forward the rename to the pi session via daemon RPC.
  const tab = readTabStoreState().tabs.find((t) => t.id === tabId);
  const sessionId = tab?.kind === "agent-chat" ? tab.data.sessionId?.trim() : undefined;
  if (sessionId) {
    void getDaemonClient()
      .then((client) => client.pi.rename({ sessionId, title }))
      .catch((error) => {
        console.error("Failed to rename pi session", error);
      });
  }
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
