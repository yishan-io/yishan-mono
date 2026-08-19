import { generateId } from "@shared/ids/generateId";
import { sendPiCommand } from "../daemon/daemonAgentProcedures";
import type {
  AgentMessage,
  AgentModel,
  AgentQueueState,
  AgentSessionStats,
  AgentStreamEvent,
} from "../chat/agentChatTypes";
import {
  flushAgentChatStreamBuffer,
  peekAgentChatStreamMessage,
  queueAgentChatStreamMessage,
  setAgentChatStreamTabVisible as setBufferedAgentChatStreamTabVisible,
} from "../runtime/agentChatStreamBuffer";
import { agentChatStore } from "../state/agentChatStore";
import {
  PER_MESSAGE_UTF8_BYTES,
  isRecord,
  normalizeBoundedDetails,
  normalizeIncomingAgentMessage,
  truncateMessageContent,
  truncateUtf8Bytes,
} from "./agentChatInboundMessage";
import { applyStreamDelta, cloneAgentMessage, cloneContentBlocks } from "./agentChatStreamMessageHelpers";
import {
  applySubagentLifecycleWidget,
  applySubagentLiveTranscripts,
  parseSubagentLifecycleWidget,
  parseSubagentLiveTranscripts,
  parseSubagentProgressTargets,
} from "./agentChatSubagentEvents";

// Re-export so callers that import parsePendingUiRequest from here still work.
export { parsePendingUiRequest } from "./agentChatUiRequestParser";

// ─── Streaming message helpers ────────────────────────────────────────────────

export function cloneIncomingAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: Array.isArray(message.content) ? cloneContentBlocks(message.content) : message.content,
  };
}

export function getLatestStreamingMessage(tabId: string): AgentMessage | null {
  return (
    peekAgentChatStreamMessage(tabId) ?? agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage ?? null
  );
}

export function queueStreamingMessageUpdate(tabId: string, message: AgentMessage): void {
  queueAgentChatStreamMessage({
    tabId,
    message,
    onFlush: (nextMessage) => {
      agentChatStore.getState().updateStreamingMessage(tabId, nextMessage);
    },
  });
}

// ─── Stream event parser ──────────────────────────────────────────────────────

const MAX_STREAM_CONTENT_INDEX = 10_000;

/**
 * Parses a raw assistantMessageEvent object into a typed AgentStreamEvent.
 * Applies normalizeBoundedDetails to toolcall_end arguments so large
 * tool-call payloads are bounded before entering renderer state.
 */
export function parseAgentStreamEvent(rawEvent: unknown): AgentStreamEvent | null {
  if (!isRecord(rawEvent) || typeof rawEvent.type !== "string") {
    return null;
  }

  switch (rawEvent.type) {
    case "start":
      return { type: "start" };
    case "done":
    case "error":
      return typeof rawEvent.reason === "string" ? { type: rawEvent.type, reason: rawEvent.reason } : null;
    case "text_start":
    case "thinking_start":
      return isValidStreamContentIndex(rawEvent.contentIndex)
        ? { type: rawEvent.type, contentIndex: rawEvent.contentIndex }
        : null;
    case "text_delta":
    case "thinking_delta":
      return isValidStreamContentIndex(rawEvent.contentIndex) && typeof rawEvent.delta === "string"
        ? { type: rawEvent.type, contentIndex: rawEvent.contentIndex, delta: rawEvent.delta }
        : null;
    case "text_end":
    case "thinking_end":
      return isValidStreamContentIndex(rawEvent.contentIndex) && typeof rawEvent.content === "string"
        ? { type: rawEvent.type, contentIndex: rawEvent.contentIndex, content: rawEvent.content }
        : null;
    case "toolcall_start":
      return isValidStreamContentIndex(rawEvent.contentIndex) &&
        typeof rawEvent.toolCallId === "string" &&
        typeof rawEvent.toolName === "string"
        ? {
            type: "toolcall_start",
            contentIndex: rawEvent.contentIndex,
            toolCallId: rawEvent.toolCallId,
            toolName: rawEvent.toolName,
          }
        : null;
    case "toolcall_delta":
      return isValidStreamContentIndex(rawEvent.contentIndex) &&
        typeof rawEvent.toolCallId === "string" &&
        typeof rawEvent.delta === "string"
        ? {
            type: "toolcall_delta",
            contentIndex: rawEvent.contentIndex,
            toolCallId: rawEvent.toolCallId,
            delta: rawEvent.delta,
          }
        : null;
    case "toolcall_end": {
      if (
        !isValidStreamContentIndex(rawEvent.contentIndex) ||
        typeof rawEvent.toolCallId !== "string" ||
        !isRecord(rawEvent.toolCall) ||
        typeof rawEvent.toolCall.id !== "string" ||
        typeof rawEvent.toolCall.name !== "string" ||
        !isRecord(rawEvent.toolCall.arguments)
      ) {
        return null;
      }
      // Bound tool-call arguments at the parse boundary so applyStreamDelta
      // receives pre-bounded arguments and cannot grow renderer state without limit.
      const boundedArguments = normalizeBoundedDetails(rawEvent.toolCall.arguments, 0) ?? {};
      return {
        type: "toolcall_end",
        contentIndex: rawEvent.contentIndex,
        toolCallId: rawEvent.toolCallId,
        toolCall: {
          id: rawEvent.toolCall.id,
          name: rawEvent.toolCall.name,
          arguments: boundedArguments,
        },
      };
    }
    default:
      return null;
  }
}

function isValidStreamContentIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STREAM_CONTENT_INDEX;
}

// ─── Pi response handler ──────────────────────────────────────────────────────

export function handlePiResponse(tabId: string, sessionId: string, event: Record<string, unknown>): void {
  const command = event.command as string | undefined;
  const success = event.success as boolean | undefined;

  if (!command) return;

  switch (command) {
    case "set_model": {
      if (success) {
        const data = event.data as AgentModel | undefined;
        if (data && typeof data === "object") {
          agentChatStore.getState().setCurrentModel(tabId, data);
        }
        break;
      }

      // fire-and-forget: resync the selector from Pi after a rejected model change
      void resyncAgentState(tabId, sessionId);
      break;
    }
    case "get_available_models": {
      if (!success) break;
      const data = event.data as { models?: AgentModel[] } | undefined;
      const models = data?.models ?? [];
      agentChatStore.getState().setAvailableModels(tabId, models);
      break;
    }
    case "get_state": {
      if (!success) break;
      const data = event.data as Record<string, unknown> | undefined;
      if (data?.model && typeof data.model === "object") {
        agentChatStore.getState().setCurrentModel(tabId, data.model as AgentModel);
      }
      if (typeof data?.thinkingLevel === "string") {
        agentChatStore.getState().setThinkingLevel(tabId, data.thinkingLevel);
      }
      const currentState = agentChatStore.getState().sessionsByTabId[tabId]?.state;
      if (data?.isCompacting === true) {
        agentChatStore.getState().setSessionState(tabId, "compacting");
      } else if (data?.isStreaming === true) {
        agentChatStore.getState().setCompactionReason(tabId, null);
        agentChatStore.getState().setSessionState(tabId, "running");
      } else if (currentState !== "running" && currentState !== "compacting") {
        agentChatStore.getState().setSessionState(tabId, "idle");
      }
      agentChatStore.getState().markStateLoaded(tabId);
      break;
    }
    case "get_session_stats": {
      if (!success) break;
      const requestSequence = statsRequestSequenceBySessionId.get(sessionId);
      if (requestSequence === undefined) break;
      const responseID = typeof event.id === "string" ? event.id : undefined;
      const expectedID = `agent-chat-stats-${requestSequence}`;
      if (responseID !== expectedID) break;
      // A stats snapshot is only meaningful while the session is idle. Responses landing
      // during a run (e.g. a lifecycle reattach refresh issued mid-turn) reflect pre-turn
      // data and would re-freeze the label on stale values. The post-compaction "?" still
      // works: manual compaction settles to idle before its refresh response arrives.
      const sessionState = agentChatStore.getState().sessionsByTabId[tabId]?.state;
      if (sessionState === "running" || sessionState === "compacting") break;
      const stats = normalizeSessionStats(event.data);
      if (stats) {
        agentChatStore.getState().setSessionStats(tabId, stats);
      }
      break;
    }
    case "get_messages": {
      if (!success) break;
      const messages = isRecord(event.data) && Array.isArray(event.data.messages) ? event.data.messages : [];
      agentChatStore.getState().replaceMessages(
        tabId,
        messages.flatMap((rawMessage) => {
          const message = normalizeIncomingAgentMessage(rawMessage);
          return message ? [cloneIncomingAgentMessage(message)] : [];
        }),
      );
      break;
    }
    default:
      break;
  }
}

/** Sends a get_state command to Pi to resync session state (e.g. after a rejected model change). */
async function resyncAgentState(tabId: string, sessionId: string): Promise<void> {
  await sendPiCommand({ sessionId, command: { type: "get_state" } });
}

const statsRequestSequenceBySessionId = new Map<string, number>();

export async function refreshAgentSessionStats(sessionId: string): Promise<void> {
  const requestSequence = (statsRequestSequenceBySessionId.get(sessionId) ?? 0) + 1;
  statsRequestSequenceBySessionId.set(sessionId, requestSequence);
  await sendPiCommand({
    sessionId,
    command: { type: "get_session_stats", id: `agent-chat-stats-${requestSequence}` },
  });
}

/**
 * Marks the cached session stats stale when a new turn starts producing tokens.
 *
 * Nulls sessionStats so the usage label falls back to the live streaming
 * estimate, and bumps the request sequence so any get_session_stats response
 * that was in flight before the turn started is dropped by the id guard in
 * handlePiResponse instead of repopulating stale data mid-turn.
 */
export function invalidateAgentSessionStats(tabId: string, sessionId: string): void {
  statsRequestSequenceBySessionId.set(sessionId, (statsRequestSequenceBySessionId.get(sessionId) ?? 0) + 1);
  agentChatStore.getState().setSessionStats(tabId, null);
}

/** Drops the request-sequence entry for a closed session to keep the map bounded. */
export function clearAgentChatSessionStatsSequence(sessionId: string): void {
  statsRequestSequenceBySessionId.delete(sessionId);
}

function normalizeSessionStats(value: unknown): AgentSessionStats | null {
  if (!isRecord(value) || !isRecord(value.tokens) || typeof value.cost !== "number") return null;
  const { tokens } = value;
  const { input, output, cacheRead, cacheWrite, total } = tokens;
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    typeof cacheRead !== "number" ||
    typeof cacheWrite !== "number" ||
    typeof total !== "number"
  ) {
    return null;
  }
  const rawContextUsage = isRecord(value.contextUsage) ? value.contextUsage : undefined;
  const contextTokens = rawContextUsage?.tokens;
  const contextWindow = rawContextUsage?.contextWindow;
  const contextPercent = rawContextUsage?.percent;
  const contextUsage =
    (typeof contextTokens === "number" || contextTokens === null) &&
    typeof contextWindow === "number" &&
    (typeof contextPercent === "number" || contextPercent === null)
      ? { tokens: contextTokens, contextWindow, percent: contextPercent }
      : undefined;
  return {
    tokens: { input, output, cacheRead, cacheWrite, total },
    cost: value.cost,
    contextUsage,
  };
}

// ─── Pi session send commands ─────────────────────────────────────────────────

/** Initializes the chat store entry for a tab. */
export function registerAgentSession(opts: { tabId: string; sessionId: string }): void {
  agentChatStore.getState().initSession(opts.tabId, opts.sessionId);
}

/** Publishes one chat tab's visibility so hidden tabs can flush less aggressively. */
export function setAgentChatStreamTabVisible(tabId: string, visible: boolean): void {
  setBufferedAgentChatStreamTabVisible(tabId, visible);
}

/** Sets the model for the pi session. */
export async function setAgentModel(opts: {
  tabId: string;
  sessionId: string;
  provider: string;
  modelId: string;
}): Promise<void> {
  await sendPiCommand({
    sessionId: opts.sessionId,
    command: { type: "set_model", provider: opts.provider, modelId: opts.modelId },
  });
}

/** Sets the thinking level. */
export async function setAgentThinkingLevel(opts: {
  tabId: string;
  sessionId: string;
  level: string;
}): Promise<void> {
  await sendPiCommand({
    sessionId: opts.sessionId,
    command: { type: "set_thinking_level", level: opts.level },
  });
  agentChatStore.getState().setThinkingLevel(opts.tabId, opts.level);
}

// ─── Handler-facing re-exports ─────────────────────────────────────────────────
// agentChatPiEventHandler.ts imports exclusively from this module so the
// dependency graph stays one-way: handler → shared → (underlying modules).
export {
  PER_MESSAGE_UTF8_BYTES,
  applyStreamDelta,
  applySubagentLiveTranscripts,
  applySubagentLifecycleWidget,
  agentChatStore,
  cloneAgentMessage,
  flushAgentChatStreamBuffer,
  generateId,
  normalizeIncomingAgentMessage,
  parseSubagentLiveTranscripts,
  parseSubagentLifecycleWidget,
  parseSubagentProgressTargets,
  truncateMessageContent,
  truncateUtf8Bytes,
};
export type { AgentQueueState };
