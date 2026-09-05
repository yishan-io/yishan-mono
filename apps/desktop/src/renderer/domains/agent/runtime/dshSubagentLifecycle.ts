import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { projectDshLineageSubagents } from "../chat/agentChatDshLineage";
import { listAgentSessionLineage } from "../daemon/daemonAgentProcedures";
import type { AgentSessionLineageResult } from "../daemon/daemonAgentTypes";
import { agentChatStore } from "../state/agentChatStore";

/** Checks whether a tab still owns its active DSH parent session. */
export type IsActiveDshParent = (tabId: string, sessionId: string) => boolean;

/** Refreshes and projects the authoritative DSH direct-child lineage snapshot. */
export async function refreshLineage(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  rootSessionId: string;
  isActiveDshParent: IsActiveDshParent;
}): Promise<AgentSessionLineageResult | null> {
  if (!opts.isActiveDshParent(opts.tabId, opts.rootSessionId)) return null;
  const generation = agentChatStore.getState().beginDshSubagentLineageRefresh(opts.tabId, opts.rootSessionId);
  if (generation === null) return null;
  try {
    const lineage = await listAgentSessionLineage({
      runtime: "dsh",
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      rootSessionId: opts.rootSessionId,
      mode: "children",
    });
    if (!opts.isActiveDshParent(opts.tabId, opts.rootSessionId)) return null;
    agentChatStore.getState().applyDshSubagentLineageRefresh({
      tabId: opts.tabId,
      parentSessionId: opts.rootSessionId,
      generation,
      rows: projectDshLineageSubagents(lineage),
    });
    return lineage;
  } catch (error) {
    console.warn("Failed to refresh DSH subagent lineage", getErrorMessage(error));
    return null;
  }
}

/** Confirms a pending cancellation after a matching finished lifecycle refresh. */
export function confirmCancellation(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId: string;
  lifecycle: { parentSessionId: string; childSessionId: string; event: "started" | "finished" };
  lineage: AgentSessionLineageResult | null;
  isActiveDshParent: IsActiveDshParent;
}): void {
  if (
    opts.lifecycle.event !== "finished" ||
    opts.lifecycle.parentSessionId !== opts.sessionId ||
    opts.lifecycle.childSessionId !== opts.childSessionId ||
    !opts.lineage ||
    !isCancellationPending(opts)
  ) {
    return;
  }
  if (isChildInactiveOrGone(opts.lineage, opts.childSessionId)) {
    agentChatStore.getState().clearSubagentCancelState(opts.tabId, opts.rowKey);
  }
}

/** Returns whether the authoritative snapshot no longer reports an active child. */
function isChildInactiveOrGone(lineage: AgentSessionLineageResult, childSessionId: string): boolean {
  return !lineage.children.some(
    (child) => child.sessionId === childSessionId && child.live && child.activity !== "inactive",
  );
}

function isCancellationPending(opts: {
  tabId: string;
  sessionId: string;
  rowKey: string;
  childSessionId: string;
  isActiveDshParent: IsActiveDshParent;
}): boolean {
  const session = agentChatStore.getState().sessionsByTabId[opts.tabId];
  return (
    opts.isActiveDshParent(opts.tabId, opts.sessionId) &&
    session?.sessionId === opts.sessionId &&
    session.subagentCancelStates[opts.rowKey]?.status === "cancelling"
  );
}
