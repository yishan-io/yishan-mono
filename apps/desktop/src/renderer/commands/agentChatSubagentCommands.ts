import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import { splitPaneStore } from "../store/splitPaneStore";
import { tabStore } from "../store/tabStore";
import { findTabWithSession } from "./agentChatCommands";

/** Opens one sub-agent child session in a right split pane when possible. */
export async function openSubagentSessionInRightSplitPane(opts: {
  workspaceId: string;
  cwd: string;
  parentPaneId?: string;
  childSessionId: string;
  title: string;
}): Promise<void> {
  const existingTabId =
    findTabWithSession(opts.childSessionId) ??
    tabStore.getState().tabs.find((tab) => {
      return (
        tab.workspaceId === opts.workspaceId &&
        tab.kind === "agent-chat" &&
        tab.data.sessionId?.trim() === opts.childSessionId
      );
    })?.id;
  if (existingTabId) {
    selectAgentChatTabInPane(opts.workspaceId, existingTabId);
    return;
  }

  const normalizedParentPaneId = opts.parentPaneId?.trim();
  if (!normalizedParentPaneId) {
    tabStore.getState().openTab({
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
    });
    return;
  }

  const parentPane = splitPaneStore.getState().getPane(opts.workspaceId, normalizedParentPaneId);
  if (!parentPane) {
    tabStore.getState().openTab({
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
    });
    return;
  }

  const previousTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));
  splitPaneStore.getState().setActivePane(opts.workspaceId, normalizedParentPaneId);
  tabStore.getState().openTab(
    {
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
    },
    { activePaneTabIds: parentPane.tabIds },
  );

  const createdTab = tabStore.getState().tabs.find((tab) => {
    return (
      !previousTabIds.has(tab.id) &&
      tab.workspaceId === opts.workspaceId &&
      tab.kind === "agent-chat" &&
      tab.data.sessionId?.trim() === opts.childSessionId
    );
  });
  if (!createdTab) {
    return;
  }

  splitPaneStore.getState().registerTabInPane(opts.workspaceId, createdTab.id, normalizedParentPaneId);
  splitPaneStore.getState().splitPane(opts.workspaceId, {
    tabId: createdTab.id,
    targetPaneId: normalizedParentPaneId,
    direction: "horizontal",
    placement: "second",
  });
  tabStore.getState().selectTab(createdTab.id);
}

/** Sends one `/agent-stop` prompt through the parent session without optimistic chat-stream UI updates. */
export async function cancelSubagentRun(opts: { tabId: string; sessionId: string; agentId: string }): Promise<void> {
  const client = await getDaemonClient();
  const sessionState = agentChatStore.getState().sessionsByTabId[opts.tabId]?.state;
  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: `/agent-stop ${opts.agentId}`,
      streamingBehavior: sessionState === "running" ? "steer" : undefined,
    },
  });
}

function selectAgentChatTabInPane(workspaceId: string, tabId: string): void {
  const pane = splitPaneStore.getState().getPaneForTab(workspaceId, tabId);
  if (pane) {
    splitPaneStore.getState().selectTab(workspaceId, pane.id, tabId);
  }
  tabStore.getState().selectTab(tabId);
}
