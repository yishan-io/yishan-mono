import { generateId } from "../helpers/generateId";
import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import type {
  AgentContentBlock,
  AgentMessage,
  AgentModel,
  AgentQueueState,
  AgentStreamEvent,
} from "../store/agentChatTypes";

// ─── Daemon RPC calls ────────────────────────────────────────────────────────

type PiStartResult = { sessionId: string };

/** Starts a pi RPC session for a chat tab. */
export async function startAgentSession(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
}): Promise<string> {
  const sessionId = opts.sessionId ?? generateId();
  const client = await getDaemonClient();

  const result = (await client.pi.start({
    sessionId,
    tabId: opts.tabId,
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
  })) as PiStartResult;

  return result.sessionId;
}

/** Registers a started agent session in the renderer store. */
export function registerAgentSession(opts: { tabId: string; sessionId: string }): void {
  agentChatStore.getState().initSession(opts.tabId, opts.sessionId);
}

/** Stops a pi RPC session. */
export async function stopAgentSession(opts: { tabId: string; sessionId: string }): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.stop({ sessionId: opts.sessionId });

  const currentSession = agentChatStore.getState().sessionsByTabId[opts.tabId];
  if (currentSession?.sessionId === opts.sessionId) {
    agentChatStore.getState().removeSession(opts.tabId);
  }
}

/** Sends a prompt command to the pi session. */
export async function sendAgentPrompt(opts: {
  tabId: string;
  sessionId: string;
  message: string;
}): Promise<void> {
  const client = await getDaemonClient();
  const tabSession = agentChatStore.getState().sessionsByTabId[opts.tabId];

  await client.pi.send({
    sessionId: opts.sessionId,
    command: {
      type: "prompt",
      message: opts.message,
      streamingBehavior: tabSession?.state === "running" ? "steer" : undefined,
    },
  });

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
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "abort" },
  });
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

/** Fetches available models from the pi session. Result arrives via agent.pi.event. */
export async function fetchAgentModels(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "get_available_models" },
  });
  // Response arrives asynchronously via agent.pi.event → handlePiResponse.
}

/** Fetches session state (model, thinkingLevel) from the pi session. */
export async function fetchAgentState(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "get_state" },
  });
  // Response arrives asynchronously via agent.pi.event → handlePiResponse.
}

/** Fetches all conversation messages from the pi session. */
export async function fetchAgentMessages(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "get_messages" },
  });
  // Response arrives asynchronously via agent.pi.event → handlePiResponse.
}

// ─── Pi event handler ────────────────────────────────────────────────────────

type PiEventPayload = {
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
  const store = agentChatStore.getState();
  const currentSession = store.sessionsByTabId[tabId];

  if (!currentSession) {
    return; // Tab not yet initialized or already closed.
  }
  if (currentSession.sessionId !== sessionId) {
    return; // Ignore stale events from an older session for the same tab.
  }

  switch (event.type) {
    case "agent_start":
      store.setSessionState(tabId, "running");
      break;

    case "agent_end":
      store.setSessionState(tabId, "idle");
      break;

    case "message_start": {
      const msg = event.message as AgentMessage | undefined;
      if (msg && msg.role === "assistant") {
        // Preserve content blocks pi sent (models may pre-fill thinking/text).
        // Deltas will append to these blocks by contentIndex.
        const content = Array.isArray(msg.content) ? (msg.content as AgentContentBlock[]) : [];
        store.updateStreamingMessage(tabId, {
          ...msg,
          id: msg.id ?? generateId(),
          content,
          startedAtMs: Date.now(),
        });
      }
      break;
    }

    case "message_update": {
      const snapshot = event.message as AgentMessage | undefined;
      const streaming = store.sessionsByTabId[tabId]?.streamingMessage;

      if (snapshot?.role === "assistant") {
        store.updateStreamingMessage(tabId, {
          ...snapshot,
          id: streaming?.id ?? snapshot.id ?? generateId(),
          content: Array.isArray(snapshot.content) ? [...snapshot.content] : [],
          startedAtMs: streaming?.startedAtMs,
          durationMs: streaming?.durationMs,
        });
        break;
      }

      const delta = event.assistantMessageEvent as AgentStreamEvent | undefined;
      if (!delta || !streaming) break;
      applyStreamDelta(streaming, delta);
      // New content array so React detects the change.
      store.updateStreamingMessage(tabId, {
        ...streaming,
        content: Array.isArray(streaming.content) ? [...streaming.content] : [],
      });
      break;
    }

    case "message_end": {
      const msg = event.message as AgentMessage | undefined;
      if (!msg) break;
      if (msg.role === "assistant") {
        const startedAtMs = store.sessionsByTabId[tabId]?.streamingMessage?.startedAtMs ?? Date.now();
        store.updateStreamingMessage(tabId, {
          ...msg,
          id: store.sessionsByTabId[tabId]?.streamingMessage?.id ?? msg.id ?? generateId(),
          content: Array.isArray(msg.content) ? [...msg.content] : [],
          startedAtMs,
          durationMs: Math.max(0, Date.now() - startedAtMs),
        });
        store.finalizeStreamingMessage(tabId);
      } else {
        // User and toolResult messages arrive complete.
        store.appendMessage(tabId, {
          ...msg,
          id: msg.id ?? generateId(),
        });
      }
      break;
    }

    case "tool_execution_start":
      // Handled inline by AgentToolCallCard via prop updates.
      break;

    case "tool_execution_update":
    case "tool_execution_end":
      // Tool results are part of message content; no separate store action needed.
      break;

    case "queue_update": {
      const queue = event as unknown as AgentQueueState;
      store.setQueue(tabId, {
        steering: queue.steering ?? [],
        followUp: queue.followUp ?? [],
      });
      break;
    }

    case "turn_start":
    case "turn_end":
    case "compaction_start":
    case "compaction_end":
      // Lifecycle events; no store action needed.
      break;

    case "response": {
      // Command responses from pi (e.g., get_available_models result).
      handlePiResponse(tabId, event);
      break;
    }

    default:
      break;
  }
}

// ─── Streaming helpers ───────────────────────────────────────────────────────

function applyStreamDelta(message: AgentMessage, delta: AgentStreamEvent): void {
  const content: AgentContentBlock[] = Array.isArray(message.content) ? [...message.content] : [];

  // Ensure the content array has enough slots for contentIndex-based deltas.
  const ensureIndex = (idx: number, block: AgentContentBlock): void => {
    while (content.length <= idx) {
      content.push({ type: "text", text: "" });
    }
    content[idx] = block;
  };

  switch (delta.type) {
    case "text_start":
      content.push({ type: "text", text: "" });
      break;

    case "text_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "text") {
        block.text += delta.delta;
      } else {
        // Block doesn't exist yet — some providers skip text_start.
        ensureIndex(delta.contentIndex, { type: "text", text: delta.delta });
      }
      break;
    }

    case "thinking_start":
      content.push({ type: "thinking", thinking: "" });
      break;

    case "thinking_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "thinking") {
        block.thinking += delta.delta;
      } else {
        ensureIndex(delta.contentIndex, { type: "thinking", thinking: delta.delta });
      }
      break;
    }

    case "toolcall_start":
      content.push({
        type: "toolCall",
        id: delta.toolCallId,
        name: delta.toolName,
        arguments: {},
      });
      break;

    case "toolcall_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "toolCall") {
        try {
          block.arguments = { ...block.arguments, ...JSON.parse(delta.delta) };
        } catch {
          // Partial JSON; ignore.
        }
      }
      break;
    }

    case "toolcall_end": {
      const block = content[delta.contentIndex];
      if (block && block.type === "toolCall" && delta.toolCall) {
        block.arguments = delta.toolCall.arguments;
      }
      break;
    }
  }

  message.content = content;
}

// ─── Response handler ─────────────────────────────────────────────────────────

function handlePiResponse(tabId: string, event: Record<string, unknown>): void {
  const command = event.command as string | undefined;
  const success = event.success as boolean | undefined;

  if (!success || !command) return;

  switch (command) {
    case "get_available_models": {
      const data = event.data as { models?: AgentModel[] } | undefined;
      const models = data?.models ?? [];
      agentChatStore.getState().setAvailableModels(tabId, models);
      break;
    }
    case "get_state": {
      const data = event.data as Record<string, unknown> | undefined;
      if (data?.model && typeof data.model === "object") {
        const model = data.model as AgentModel;
        agentChatStore.getState().setCurrentModel(tabId, model);
      }
      if (typeof data?.thinkingLevel === "string") {
        agentChatStore.getState().setThinkingLevel(tabId, data.thinkingLevel);
      }
      if (typeof data?.isStreaming === "boolean" && data.isStreaming) {
        agentChatStore.getState().setSessionState(tabId, "running");
      } else {
        agentChatStore.getState().setSessionState(tabId, "idle");
      }
      break;
    }
    case "get_messages": {
      const data = event.data as { messages?: AgentMessage[] } | undefined;
      const messages = data?.messages ?? [];
      for (const msg of messages) {
        agentChatStore.getState().appendMessage(tabId, {
          ...msg,
          id: msg.id ?? generateId(),
        });
      }
      break;
    }
    default:
      break;
  }
}
