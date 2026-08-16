import { generateId } from "../../../helpers/generateId";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { agentChatStore } from "../../../store/agentChatStore";
import { isAgentSessionBusy } from "../../../store/agentChatTypes";
import {
  clearAgentChatSessionStatsSequence,
  handleAgentPiEvent,
  refreshAgentSessionStats,
  registerAgentSession,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "../../../commands/agentChatPiEventHelpers";
import {
  clearPiSessionHandle,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  findTabWithSession,
  reattachPiSession,
  stopPiSession,
} from "../runtime/agentSessionRuntime";
import { flushAgentChatStreamBuffer } from "../runtime/agentChatStreamBuffer";

// Re-export moved public APIs so existing callers need no import changes
// (removed in Phase 5 task 6 once callers migrate to the canonical paths).
export {
  handleAgentPiEvent,
  refreshAgentSessionStats,
  registerAgentSession,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "../../../commands/agentChatPiEventHelpers";
export { clearAgentChatSessionStatsSequence } from "../../../commands/agentChatPiEventShared";

// ─── Session lifecycle (delegates to AgentSessionRuntime) ───────────────────
// The Runtime owns Pi session handles, start/attach/stop/reopen races, and the
// state-hydration sends. These command wrappers keep the public command surface
// stable for UI callers and the AgentCommands contract.

export { ensurePiSession, findTabWithSession, clearPiSessionHandle, reattachPiSession, stopPiSession };
export { fetchAgentState, fetchAgentMessages, fetchAgentModels };

/** Sends a prompt command to the pi session. */
export async function sendAgentPrompt(opts: {
  tabId: string;
  sessionId: string;
  message: string;
}): Promise<void> {
  const client = await getDaemonClient();
  const tabSession = agentChatStore.getState().sessionsByTabId[opts.tabId];

  const isBusy = isAgentSessionBusy(tabSession?.state);
  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: opts.message,
      streamingBehavior: isBusy ? "steer" : undefined,
    },
  });

  agentChatStore.getState().clearTurnError(opts.tabId);
  if (isBusy) {
    return;
  }

  if (!agentChatStore.getState().sessionsByTabId[opts.tabId]?.streamingMessage) {
    agentChatStore.getState().updateStreamingMessage(opts.tabId, {
      id: generateId(),
      role: "assistant",
      content: [],
      startedAtMs: Date.now(),
    });
  }
  agentChatStore.getState().setSessionState(opts.tabId, "running");
}

/** Aborts the current agent operation. */
export async function abortAgent(opts: { tabId: string; sessionId: string }): Promise<void> {
  flushAgentChatStreamBuffer(opts.tabId);

  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "abort" },
  });
}

/** Manually compacts the current Pi session context. */
export async function compactAgent(opts: { sessionId: string }): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "compact" },
  });
}

/** Sends one response to a pending RPC extension UI request. */
export async function respondToAgentExtensionUiRequest(opts: {
  tabId: string;
  sessionId: string;
  requestId: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}): Promise<void> {
  const client = await getDaemonClient();
  const command: Record<string, unknown> = {
    type: "extension_ui_response",
    id: opts.requestId,
  };

  if (opts.cancelled === true) {
    command.cancelled = true;
  } else if (typeof opts.confirmed === "boolean") {
    command.confirmed = opts.confirmed;
  } else {
    command.value = opts.value ?? "";
  }

  await client.pi.send({
    sessionId: opts.sessionId,
    command,
  });
  agentChatStore.getState().clearPendingUiRequest(opts.tabId);
}

// ─── Session history ─────────────────────────────────────────────────────────
// Moved to agentChatSessionHistory.ts; re-exported to preserve the public API.
export { fetchAgentSessionFilePath, fetchSessionHistory, listActivePiSessions } from "../../../commands/agentChatSessionHistory";
