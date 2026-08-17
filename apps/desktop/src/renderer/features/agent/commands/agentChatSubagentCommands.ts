import { getLayout, getPane, getPaneForTab } from "@renderer/features/workbench";
import { getTabs } from "@renderer/features/workbench";
import {
  createAdjacentPaneWithTab,
  moveTabToPane,
  openTab,
  paneSelectTab,
  registerTabInPane,
  reorderPaneTab,
  setActivePane,
  setAgentChatTabSubagentControl,
  setSelectedTab,
  splitWorkspacePane,
  unregisterTabFromPane,
} from "../../../features/workbench/commands/tabCommands";
import { findOppositePaneId } from "../../../features/workbench/model/split-pane";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { agentChatStore } from "../model/agentChatStore";
import { isAgentSessionBusy } from "../model/agentChatTypes";
import { findTabWithSession } from "./agentChatCommands";

const SUBAGENT_SPLIT_DIRECTION = "horizontal";
const SUBAGENT_SPLIT_PLACEMENT = "second";
const SUBAGENT_CANCEL_STEER_MESSAGE_PREFIX = "The user cancelled sub-agent";
/**
 * How long to wait after sending /agent-stop for the run's terminal entry to
 * remove the row before reporting the cancel as failed. The extension force-
 * settles a hung run within its interrupt settle bound (~2s), so this bound
 * covers the round trip with margin.
 */
const SUBAGENT_CANCEL_CONFIRM_TIMEOUT_MS = 5_000;
const SUBAGENT_CANCEL_POLL_INTERVAL_MS = 250;

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
    getTabs().find((tab) => {
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
    setAgentChatTabSubagentControl({
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
    openTab({
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

  const parentPane = getPane(opts.workspaceId, normalizedParentPaneId);
  if (!parentPane) {
    console.debug("[agentChatSubagentCommands] opening without resolved parent pane", {
      ...opts,
      normalizedParentPaneId,
    });
    openTab({
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
  const previousTabIds = new Set(getTabs().map((tab) => tab.id));
  setActivePane(opts.workspaceId, normalizedParentPaneId);
  openTab(
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

  const createdTab = getTabs().find((tab) => {
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
      tabIds: getTabs().map((tab) => tab.id),
    });
    return;
  }

  console.debug("[agentChatSubagentCommands] created subagent tab; splitting pane", {
    createdTabId: createdTab.id,
    normalizedParentPaneId,
  });
  placeUnplacedSubagentTabInOppositePane(opts.workspaceId, normalizedParentPaneId, createdTab.id);
  setSelectedTab(createdTab.id);
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

  const parentPane = getPane(opts.workspaceId, normalizedParentPaneId);
  if (!parentPane) {
    console.debug("[agentChatSubagentCommands] reveal selecting without resolved parent pane", opts);
    selectAgentChatTabInPane(opts.workspaceId, opts.tabId);
    return;
  }

  const existingPane = getPaneForTab(opts.workspaceId, opts.tabId);
  if (existingPane && existingPane.id !== normalizedParentPaneId) {
    console.debug("[agentChatSubagentCommands] reveal selecting tab in existing pane", {
      ...opts,
      existingPaneId: existingPane.id,
    });
    paneSelectTab(opts.workspaceId, existingPane.id, opts.tabId);
    setSelectedTab(opts.tabId);
    return;
  }

  console.debug("[agentChatSubagentCommands] reveal splitting pane", {
    ...opts,
    normalizedParentPaneId,
    existingPaneId: existingPane?.id,
  });
  if (existingPane) {
    splitWorkspacePane(opts.workspaceId, {
      tabId: opts.tabId,
      targetPaneId: normalizedParentPaneId,
      direction: SUBAGENT_SPLIT_DIRECTION,
      placement: SUBAGENT_SPLIT_PLACEMENT,
    });
  } else {
    placeUnplacedSubagentTabInOppositePane(opts.workspaceId, normalizedParentPaneId, opts.tabId);
  }
  setSelectedTab(opts.tabId);
}

/**
 * Sends one `/agent-stop` prompt through the parent session without optimistic
 * chat-stream UI updates, then confirms the run actually ended.
 *
 * Marks the row "cancelling" first, then resolves to "failed" (with a reason)
 * if no terminal entry removes the row within the confirmation bound, or if
 * there is no live run id to target. The caller renders the feedback; nothing
 * is ever silently dropped.
 */
export async function cancelSubagentRun(opts: {
  tabId: string;
  sessionId: string;
  /** Row identity for cancel feedback: childSessionId ?? rowId. */
  rowKey: string;
  agentId?: string;
  agentName?: string;
  childSessionId?: string;
}): Promise<void> {
  const stopTarget = opts.childSessionId?.trim() || opts.agentId?.trim();
  if (!stopTarget) {
    agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, {
      status: "failed",
      reason: "missing",
    });
    return;
  }

  agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, { status: "cancelling" });

  try {
    const client = await getDaemonClient();
    const sessionState = agentChatStore.getState().sessionsByTabId[opts.tabId]?.state;
    const streamingBehavior = isAgentSessionBusy(sessionState) ? "steer" : undefined;
    await client.pi.send({
      sessionId: opts.sessionId,
      command: {
        type: "prompt",
        message: `/agent-stop ${stopTarget}`,
        streamingBehavior,
      },
    });

    if (streamingBehavior === "steer") {
      const cancelledAgentLabel =
        opts.agentName?.trim() || opts.childSessionId?.trim() || opts.agentId?.trim() || stopTarget;
      await client.pi.send({
        sessionId: opts.sessionId,
        command: {
          type: "prompt",
          message: `${SUBAGENT_CANCEL_STEER_MESSAGE_PREFIX} ${cancelledAgentLabel}. Do not retry that sub-agent. Continue without it and explain any missing work if needed.`,
          streamingBehavior: "steer",
        },
      });
    }
  } catch (error) {
    agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, {
      status: "failed",
      reason: "timeout",
    });
    console.warn("[agentChatSubagentCommands] sub-agent cancel request failed", { tabId: opts.tabId, error });
    return;
  }

  const runEnded = await waitForSubagentRowGone(
    opts.tabId,
    opts.rowKey,
    stopTarget,
    SUBAGENT_CANCEL_CONFIRM_TIMEOUT_MS,
  );
  if (runEnded) {
    agentChatStore.getState().clearSubagentCancelState(opts.tabId, opts.rowKey);
    return;
  }

  agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, {
    status: "failed",
    reason: "timeout",
  });
}

/**
 * Resolves true once the cancelled run is gone, or false after the bound.
 *
 * A pending tool-call row can be replaced by its lifecycle row (same run) while
 * the cancel is in flight, so the row identity alone is not enough: when a stop
 * target is known, the run only counts as gone when no running row carries that
 * agentId/childSessionId anymore.
 */
function waitForSubagentRowGone(
  tabId: string,
  rowKey: string,
  stopTarget: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (gone: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(gone);
    };
    const isRowGone = () => {
      const rows = agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents ?? [];
      // The original row (or a same-identity replacement, e.g. pending→lifecycle
      // transition mid-cancel) must be gone for the run to count as ended.
      if (rows.some((row) => row.rowId === rowKey)) {
        return false;
      }
      if (stopTarget) {
        return !rows.some((row) => row.agentId === stopTarget || row.childSessionId === stopTarget);
      }
      return true;
    };
    // The row may already be gone before the subscription observes a change.
    if (isRowGone()) {
      resolve(true);
      return;
    }
    const unsubscribe = agentChatStore.subscribe(() => {
      if (isRowGone()) {
        finish(true);
      }
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/** Places an unplaced subagent tab in the opposite pane, creating one only when absent. */
function placeUnplacedSubagentTabInOppositePane(workspaceId: string, parentPaneId: string, tabId: string): void {
  const layout = getLayout(workspaceId);
  const oppositePaneId = findOppositePaneId(layout.root, parentPaneId);
  if (oppositePaneId) {
    registerTabInPane(workspaceId, tabId, oppositePaneId);
    return;
  }

  createAdjacentPaneWithTab(workspaceId, {
    tabId,
    targetPaneId: parentPaneId,
    direction: SUBAGENT_SPLIT_DIRECTION,
    placement: SUBAGENT_SPLIT_PLACEMENT,
  });
}

function selectAgentChatTabInPane(workspaceId: string, tabId: string): void {
  const pane = getPaneForTab(workspaceId, tabId);
  if (pane) {
    paneSelectTab(workspaceId, pane.id, tabId);
  }
  setSelectedTab(tabId);
}
