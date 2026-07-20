import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import { splitPaneStore } from "../store/splitPaneStore";
import { tabStore } from "../store/tabStore";
import { findTabWithSession } from "./agentChatCommands";

const SUBAGENT_SPLIT_DIRECTION = "horizontal";
const SUBAGENT_SPLIT_PLACEMENT = "second";
const SUBAGENT_CANCEL_STEER_MESSAGE_PREFIX = "The user cancelled sub-agent";

/** Opens one sub-agent child session in a right split pane when possible. */
export async function openSubagentSessionInRightSplitPane(opts: {
  workspaceId: string;
  cwd: string;
  parentPaneId?: string;
  parentSessionId?: string;
  agentId?: string;
  childSessionId: string;
  title: string;
}): Promise<void> {
  console.debug("[agentChatSubagentCommands] open requested", opts);
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
    console.debug("[agentChatSubagentCommands] opening existing subagent tab", {
      existingTabId,
      childSessionId: opts.childSessionId,
    });
    tabStore.getState().setAgentChatTabSubagentControl({
      tabId: existingTabId,
      agentId: opts.agentId,
      parentSessionId: opts.parentSessionId,
    });
    revealSubagentTabInRightSplitPane({
      workspaceId: opts.workspaceId,
      parentPaneId: opts.parentPaneId,
      tabId: existingTabId,
    });
    return;
  }

  const normalizedParentPaneId = opts.parentPaneId?.trim();
  if (!normalizedParentPaneId) {
    console.debug("[agentChatSubagentCommands] opening without parent pane", opts);
    tabStore.getState().openTab({
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
      sessionView: "subagent-detail",
      subagentAgentId: opts.agentId,
      subagentParentSessionId: opts.parentSessionId,
    });
    return;
  }

  const parentPane = splitPaneStore.getState().getPane(opts.workspaceId, normalizedParentPaneId);
  if (!parentPane) {
    console.debug("[agentChatSubagentCommands] opening without resolved parent pane", {
      ...opts,
      normalizedParentPaneId,
    });
    tabStore.getState().openTab({
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
      sessionView: "subagent-detail",
      subagentAgentId: opts.agentId,
      subagentParentSessionId: opts.parentSessionId,
    });
    return;
  }

  console.debug("[agentChatSubagentCommands] opening in split pane", {
    ...opts,
    normalizedParentPaneId,
    parentPane,
  });
  const previousTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));
  splitPaneStore.getState().setActivePane(opts.workspaceId, normalizedParentPaneId);
  tabStore.getState().openTab(
    {
      workspaceId: opts.workspaceId,
      kind: "agent-chat",
      title: opts.title,
      cwd: opts.cwd,
      sessionId: opts.childSessionId,
      sessionView: "subagent-detail",
      subagentAgentId: opts.agentId,
      subagentParentSessionId: opts.parentSessionId,
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
    console.debug("[agentChatSubagentCommands] open failed: tab was not created", {
      ...opts,
      tabIds: tabStore.getState().tabs.map((tab) => tab.id),
    });
    return;
  }

  console.debug("[agentChatSubagentCommands] created subagent tab; splitting pane", {
    createdTabId: createdTab.id,
    normalizedParentPaneId,
  });
  splitPaneStore.getState().registerTabInPane(opts.workspaceId, createdTab.id, normalizedParentPaneId);
  splitPaneStore.getState().splitPane(opts.workspaceId, {
    tabId: createdTab.id,
    targetPaneId: normalizedParentPaneId,
    direction: SUBAGENT_SPLIT_DIRECTION,
    placement: SUBAGENT_SPLIT_PLACEMENT,
  });
  tabStore.getState().selectTab(createdTab.id);
  console.debug("[agentChatSubagentCommands] subagent tab opened", {
    createdTabId: createdTab.id,
    childSessionId: opts.childSessionId,
  });
}

function revealSubagentTabInRightSplitPane(opts: { workspaceId: string; parentPaneId?: string; tabId: string }): void {
  const normalizedParentPaneId = opts.parentPaneId?.trim();
  console.debug("[agentChatSubagentCommands] revealing existing subagent tab", {
    ...opts,
    normalizedParentPaneId,
  });
  if (!normalizedParentPaneId) {
    console.debug("[agentChatSubagentCommands] reveal selecting without parent pane", opts);
    selectAgentChatTabInPane(opts.workspaceId, opts.tabId);
    return;
  }

  const parentPane = splitPaneStore.getState().getPane(opts.workspaceId, normalizedParentPaneId);
  if (!parentPane) {
    console.debug("[agentChatSubagentCommands] reveal selecting without resolved parent pane", opts);
    selectAgentChatTabInPane(opts.workspaceId, opts.tabId);
    return;
  }

  const existingPane = splitPaneStore.getState().getPaneForTab(opts.workspaceId, opts.tabId);
  if (existingPane && existingPane.id !== normalizedParentPaneId) {
    console.debug("[agentChatSubagentCommands] reveal selecting tab in existing pane", {
      ...opts,
      existingPaneId: existingPane.id,
    });
    splitPaneStore.getState().selectTab(opts.workspaceId, existingPane.id, opts.tabId);
    tabStore.getState().selectTab(opts.tabId);
    return;
  }

  if (!existingPane) {
    splitPaneStore.getState().registerTabInPane(opts.workspaceId, opts.tabId, normalizedParentPaneId);
  }

  console.debug("[agentChatSubagentCommands] reveal splitting pane", {
    ...opts,
    normalizedParentPaneId,
    existingPaneId: existingPane?.id,
  });
  splitPaneStore.getState().splitPane(opts.workspaceId, {
    tabId: opts.tabId,
    targetPaneId: normalizedParentPaneId,
    direction: SUBAGENT_SPLIT_DIRECTION,
    placement: SUBAGENT_SPLIT_PLACEMENT,
  });
  tabStore.getState().selectTab(opts.tabId);
}

/** Sends one `/agent-stop` prompt through the parent session without optimistic chat-stream UI updates. */
export async function cancelSubagentRun(opts: {
  tabId: string;
  sessionId: string;
  agentId?: string;
  agentName?: string;
  childSessionId?: string;
}): Promise<void> {
  const stopTarget = opts.childSessionId?.trim() || opts.agentId?.trim();
  if (!stopTarget) {
    return;
  }

  const client = await getDaemonClient();
  const sessionState = agentChatStore.getState().sessionsByTabId[opts.tabId]?.state;
  const streamingBehavior = sessionState === "running" ? "steer" : undefined;
  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: `/agent-stop ${stopTarget}`,
      streamingBehavior,
    },
  });

  if (streamingBehavior !== "steer") {
    return;
  }

  const cancelledAgentLabel = opts.agentName?.trim() || opts.childSessionId?.trim() || opts.agentId?.trim() || stopTarget;
  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: `${SUBAGENT_CANCEL_STEER_MESSAGE_PREFIX} ${cancelledAgentLabel}. Do not retry that sub-agent. Continue without it and explain any missing work if needed.`,
      streamingBehavior: "steer",
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