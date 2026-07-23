import { generateId } from "../helpers/generateId";
import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import type {
  AgentMessage,
  AgentModel,
  AgentPendingUiRequest,
  AgentQueueState,
  AgentStreamEvent,
} from "../store/agentChatTypes";
import {
  PER_MESSAGE_UTF8_BYTES,
  isRecord,
  normalizeBoundedDetails,
  normalizeIncomingAgentMessage,
  truncateMessageContent,
  truncateUtf8Bytes,
} from "./agentChatInboundMessage";
import {
  applySubagentLiveTranscripts,
  parseSubagentLiveTranscripts,
  parseSubagentProgressTargets,
} from "./agentChatSubagentEvents";
import {
  flushAgentChatStreamBuffer,
  peekAgentChatStreamMessage,
  queueAgentChatStreamMessage,
  setAgentChatStreamTabVisible as setBufferedAgentChatStreamTabVisible,
} from "./agentChatStreamBuffer";
import { applyStreamDelta, cloneAgentMessage, cloneContentBlocks } from "./agentChatStreamMessageHelpers";
import { parsePendingUiRequest } from "./agentChatUiRequestParser";

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
      agentChatStore
        .getState()
        .setSessionState(tabId, typeof data?.isStreaming === "boolean" && data.isStreaming ? "running" : "idle");
      agentChatStore.getState().markStateLoaded(tabId);
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
  const client = await getDaemonClient();
  await client.pi.send({ sessionId, command: { type: "get_state" } });
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
  const client = await getDaemonClient();
  await client.pi.send({
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
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "set_thinking_level", level: opts.level },
  });
  agentChatStore.getState().setThinkingLevel(opts.tabId, opts.level);
}

// ─── Pi event handler ─────────────────────────────────────────────────────────

export type PiEventPayload = {
  sessionId: string;
  tabId: string;
  workspaceId: string;
  event: Record<string, unknown>;
};

/**
 * Handles a single agent.pi.event payload from the daemon frontend event stream.
 * Routes to the correct tab's store based on the tabId in the payload.
 */
export function handleAgentPiEvent(payload: PiEventPayload): void {
  const { sessionId, tabId, event } = payload;
  const currentSession = agentChatStore.getState().sessionsByTabId[tabId];

  if (!currentSession) {
    return;
  }
  if (currentSession.sessionId !== sessionId) {
    return;
  }

  switch (event.type) {
    case "agent_start":
      agentChatStore.getState().setSessionState(tabId, "running");
      break;

    case "agent_end":
      flushAgentChatStreamBuffer(tabId);
      agentChatStore.getState().clearPendingUiRequest(tabId);
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      agentChatStore.getState().setSessionState(tabId, "idle");
      break;

    case "message_start": {
      const msg = normalizeIncomingAgentMessage(event.message);
      if (msg?.role === "assistant") {
        const turnError = msg.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        } else {
          agentChatStore.getState().clearTurnError(tabId);
        }

        flushAgentChatStreamBuffer(tabId);
        const clonedMessage = cloneIncomingAgentMessage(msg);
        agentChatStore.getState().updateStreamingMessage(tabId, {
          ...clonedMessage,
          id: msg.id ?? generateId(),
          startedAtMs: Date.now(),
        });
      }
      break;
    }

    case "message_update": {
      const snapshot = normalizeIncomingAgentMessage(event.message);
      if (snapshot?.role === "assistant") {
        const turnError = snapshot.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        }

        const base = getLatestStreamingMessage(tabId);
        const clonedSnapshot = cloneIncomingAgentMessage(snapshot);
        queueStreamingMessageUpdate(tabId, {
          ...clonedSnapshot,
          id: base?.id ?? snapshot.id ?? generateId(),
          startedAtMs: base?.startedAtMs,
          durationMs: base?.durationMs,
        });
        break;
      }

      const delta = parseAgentStreamEvent(event.assistantMessageEvent);
      const base = getLatestStreamingMessage(tabId);
      if (!delta || !base) break;

      const nextMessage = cloneAgentMessage(base);
      applyStreamDelta(nextMessage, delta);
      truncateMessageContent(nextMessage);
      queueStreamingMessageUpdate(tabId, nextMessage);
      break;
    }

    case "message_end": {
      const msg = normalizeIncomingAgentMessage(event.message);
      if (!msg) break;

      flushAgentChatStreamBuffer(tabId);

      if (msg.role === "assistant") {
        const turnError = msg.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        } else {
          agentChatStore.getState().clearTurnError(tabId);
        }

        const base = getLatestStreamingMessage(tabId);
        const startedAtMs = base?.startedAtMs ?? Date.now();
        const clonedMessage = cloneIncomingAgentMessage(msg);
        agentChatStore.getState().updateStreamingMessage(tabId, {
          ...clonedMessage,
          id: base?.id ?? msg.id ?? generateId(),
          startedAtMs,
          durationMs: Math.max(0, Date.now() - startedAtMs),
        });
        agentChatStore.getState().finalizeStreamingMessage(tabId);
      } else {
        agentChatStore.getState().appendMessage(tabId, {
          ...cloneIncomingAgentMessage(msg),
          id: msg.id ?? generateId(),
        });
      }
      break;
    }

    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      break;

    case "queue_update": {
      const queue = event as unknown as AgentQueueState;
      agentChatStore.getState().setQueue(tabId, {
        steering: (queue.steering ?? []).map((s) => truncateUtf8Bytes(s, PER_MESSAGE_UTF8_BYTES)),
        followUp: (queue.followUp ?? []).map((s) => truncateUtf8Bytes(s, PER_MESSAGE_UTF8_BYTES)),
      });
      break;
    }

    case "extension_ui_request": {
      const request = parsePendingUiRequest(event);
      if (request) {
        agentChatStore.getState().setPendingUiRequest(tabId, request);
      }

      const subagentProgressTargets = parseSubagentProgressTargets(event);
      if (subagentProgressTargets) {
        agentChatStore.getState().setSubagentProgressTargets(tabId, subagentProgressTargets);
      }

      const subagentLiveTranscripts = parseSubagentLiveTranscripts(event);
      if (subagentLiveTranscripts) {
        applySubagentLiveTranscripts(tabId, subagentLiveTranscripts);
      }
      break;
    }

    case "turn_start":
    case "compaction_start":
      break;

    case "turn_end":
    case "compaction_end":
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      break;

    case "response":
      handlePiResponse(tabId, sessionId, event);
      break;

    default:
      break;
  }
}
