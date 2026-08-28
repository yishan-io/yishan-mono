import { tabStore } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { cancelAgentSubagent } from "../daemon/daemonAgentProcedures";
import type { AgentSessionLineageResult } from "../daemon/daemonAgentTypes";
import { agentChatStore } from "../state/agentChatStore";
import { refreshDshSubagentLineage } from "./agentChatCommands";

const DSH_CANCEL_LINEAGE_RETRY_INTERVAL_MS = 500;
const DSH_CANCEL_LINEAGE_RETRY_ATTEMPTS = 10;

/** Cancels one DSH direct child through the daemon's authoritative runtime boundary. */
export async function cancelDshSubagentRun(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId?: string;
}): Promise<void> {
  const childSessionId = opts.childSessionId?.trim();
  if (!isCurrentDshCancellationParent(opts)) return;
  if (!childSessionId) {
    agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, { status: "failed", reason: "missing" });
    return;
  }
  if (
    agentChatStore.getState().sessionsByTabId[opts.tabId]?.subagentCancelStates[opts.rowKey]?.status === "cancelling"
  ) {
    return;
  }

  const parentTab = tabStore.getState().tabs.find((tab) => tab.id === opts.tabId);
  if (parentTab?.kind !== "agent-chat" || !isCurrentDshCancellationParent(opts)) return;

  // Set this before the RPC yields so a second click cannot dispatch another interrupt.
  agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, { status: "cancelling" });
  try {
    const receipt = await cancelAgentSubagent({
      runtime: "dsh",
      workspaceId: parentTab.workspaceId,
      cwd: parentTab.data.cwd,
      parentSessionId: opts.sessionId,
      childSessionId,
    });
    if (!receipt.interruptRequested) {
      if (isCurrentDshCancellationParent(opts)) {
        agentChatStore
          .getState()
          .setSubagentCancelState(opts.tabId, opts.rowKey, { status: "failed", reason: "timeout" });
      }
      return;
    }
  } catch (error) {
    if (isCurrentDshCancellationParent(opts)) {
      agentChatStore
        .getState()
        .setSubagentCancelState(opts.tabId, opts.rowKey, { status: "failed", reason: "timeout" });
    }
    console.warn("[agentChatSubagentCommands] DSH sub-agent cancel request failed", {
      tabId: opts.tabId,
      error: getErrorMessage(error),
    });
    return;
  }

  await confirmDshSubagentCancelledFromFallback({
    ...opts,
    childSessionId,
    workspaceId: parentTab.workspaceId,
    cwd: parentTab.data.cwd,
  });
}

/** Uses bounded lineage polling only when the lifecycle completion event was missed. */
async function confirmDshSubagentCancelledFromFallback(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId: string;
  workspaceId: string;
  cwd: string;
}): Promise<void> {
  const shouldBeginFallback = await waitForDshCancellationRetry(opts, DSH_CANCEL_LINEAGE_RETRY_INTERVAL_MS);
  if (!shouldBeginFallback) return;

  for (let attempt = 0; attempt < DSH_CANCEL_LINEAGE_RETRY_ATTEMPTS; attempt += 1) {
    if (!isCurrentDshCancellation(opts)) return;
    const lineage = await refreshDshSubagentLineage({
      tabId: opts.tabId,
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      rootSessionId: opts.sessionId,
    });
    if (!isCurrentDshCancellation(opts)) return;
    if (lineage && isDshChildInactiveOrGone(lineage, opts.childSessionId)) {
      agentChatStore.getState().clearSubagentCancelState(opts.tabId, opts.rowKey);
      return;
    }
    if (attempt < DSH_CANCEL_LINEAGE_RETRY_ATTEMPTS - 1) {
      const shouldRetry = await waitForDshCancellationRetry(opts, DSH_CANCEL_LINEAGE_RETRY_INTERVAL_MS);
      if (!shouldRetry) return;
    }
  }

  if (isCurrentDshCancellation(opts)) {
    agentChatStore.getState().setSubagentCancelState(opts.tabId, opts.rowKey, { status: "failed", reason: "timeout" });
  }
}

/**
 * Completes a pending cancellation only after the matching finished lifecycle
 * event's authoritative lineage refresh confirms that its direct child is inactive.
 */
export function confirmDshSubagentCancellationFromLifecycle(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId: string;
  lifecycle: { parentSessionId: string; childSessionId: string; event: "started" | "finished" };
  lineage: AgentSessionLineageResult | null;
}): void {
  if (
    opts.lifecycle.event !== "finished" ||
    opts.lifecycle.parentSessionId !== opts.sessionId ||
    opts.lifecycle.childSessionId !== opts.childSessionId ||
    !opts.lineage ||
    !isCurrentDshCancellation(opts)
  ) {
    return;
  }
  if (isDshChildInactiveOrGone(opts.lineage, opts.childSessionId)) {
    agentChatStore.getState().clearSubagentCancelState(opts.tabId, opts.rowKey);
  }
}

/** Returns true when the authoritative direct-child snapshot no longer reports a live active child. */
function isDshChildInactiveOrGone(lineage: AgentSessionLineageResult, childSessionId: string): boolean {
  return !lineage.children.some(
    (child) => child.sessionId === childSessionId && child.live && child.activity !== "inactive",
  );
}

/** Waits for the next bounded retry, cancelling the timer when its tab no longer owns this request. */
function waitForDshCancellationRetry(
  opts: { tabId: string; sessionId: string; rowKey: string; childSessionId: string },
  intervalMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isCurrentDshCancellation(opts)) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (shouldRetry: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribeAgent();
      unsubscribeTabs();
      resolve(shouldRetry);
    };
    const checkCurrent = () => {
      if (!isCurrentDshCancellation(opts)) finish(false);
    };
    const unsubscribeAgent = agentChatStore.subscribe(checkCurrent);
    const unsubscribeTabs = tabStore.subscribe(checkCurrent);
    const timer = setTimeout(() => finish(true), intervalMs);
  });
}

/** Checks that the tab and chat state still own the expected DSH parent session. */
function isCurrentDshCancellationParent(opts: { tabId: string; sessionId: string }): boolean {
  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === opts.tabId);
  const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
  return (
    tab?.kind === "agent-chat" &&
    tab.data.runtime === "dsh" &&
    tab.data.sessionId === opts.sessionId &&
    session?.sessionId === opts.sessionId
  );
}

/** Checks that the tab and session still own a cancelling DSH direct-child request. */
function isCurrentDshCancellation(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId: string;
}): boolean {
  const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
  return isCurrentDshCancellationParent(opts) && session?.subagentCancelStates[opts.rowKey]?.status === "cancelling";
}
