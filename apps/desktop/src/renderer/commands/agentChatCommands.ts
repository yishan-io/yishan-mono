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

  agentChatStore.getState().initSession(opts.tabId, result.sessionId);
  return result.sessionId;
}

/** Stops a pi RPC session. */
export async function stopAgentSession(opts: { tabId: string; sessionId: string }): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.stop({ sessionId: opts.sessionId });
  agentChatStore.getState().removeSession(opts.tabId);
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

/** Fetches available models from the pi session. */
export async function fetchAgentModels(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  const client = await getDaemonClient();
  const result = (await client.pi.send({
    sessionId: opts.sessionId,
    command: { type: "get_available_models" },
  })) as { data?: { models?: AgentModel[] } };

  const models = result?.data?.models ?? [];
  agentChatStore.getState().setAvailableModels(opts.tabId, models);
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
  const { tabId, event } = payload;
  const store = agentChatStore.getState();

  if (!store.sessionsByTabId[tabId]) {
    return; // Tab not yet initialized or already closed.
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
        store.updateStreamingMessage(tabId, { ...msg, id: msg.id ?? generateId() });
      }
      break;
    }

    case "message_update": {
      const delta = event.assistantMessageEvent as AgentStreamEvent | undefined;
      if (!delta) break;
      const streaming = store.sessionsByTabId[tabId]?.streamingMessage;
      if (!streaming) break;
      applyStreamDelta(streaming, delta);
      store.updateStreamingMessage(tabId, { ...streaming });
      break;
    }

    case "message_end": {
      const msg = event.message as AgentMessage | undefined;
      if (msg) {
        store.finalizeStreamingMessage(tabId);
        store.appendMessage(tabId, msg);
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

    default:
      break;
  }
}

// ─── Streaming helpers ───────────────────────────────────────────────────────

function applyStreamDelta(message: AgentMessage, delta: AgentStreamEvent): void {
  const content = Array.isArray(message.content) ? message.content : [];

  switch (delta.type) {
    case "text_start":
      content.push({ type: "text", text: "" });
      break;

    case "text_delta": {
      const block = content[delta.contentIndex];
      if (block && block.type === "text") {
        block.text += delta.delta;
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
