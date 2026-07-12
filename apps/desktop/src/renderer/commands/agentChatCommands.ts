import { generateId } from "../helpers/generateId";
import type * as Rpc from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import type {
  AgentContentBlock,
  AgentMessage,
  AgentModel,
  AgentQueueState,
  AgentStreamEvent,
} from "../store/agentChatTypes";
import {
  disposeAgentChatStreamBuffer,
  flushAgentChatStreamBuffer,
  peekAgentChatStreamMessage,
  queueAgentChatStreamMessage,
  setAgentChatStreamTabVisible as setBufferedAgentChatStreamTabVisible,
} from "./agentChatStreamBuffer";
import { applyStreamDelta, cloneAgentMessage, cloneContentBlocks } from "./agentChatStreamMessageHelpers";

// ─── Tab-level Pi session lifecycle ──────────────────────────────────────────
// Pi RPC sessions outlive React component mounts so that Strict Mode
// double-mounts reuse the same Pi process instead of starting a second one.

type PiSessionHandle = {
  rpcSessionId: string;
  piSessionId: string;
  unsubscribe: (() => void) | null;
};

const activePiSessions = new Map<string, PiSessionHandle>();

/**
 * Ensures a Pi RPC session exists for a tab. Idempotent — subsequent calls
 * for the same tabId return the existing session.
 */
export async function ensurePiSession(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  piSessionId?: string;
  paneId?: string;
}): Promise<string> {
  const existing = activePiSessions.get(opts.tabId);
  if (existing) {
    return existing.rpcSessionId;
  }

  const chatSession = agentChatStore.getState().sessionsByTabId[opts.tabId];
  if (chatSession) {
    activePiSessions.set(opts.tabId, {
      rpcSessionId: chatSession.sessionId,
      piSessionId: chatSession.sessionId,
      unsubscribe: null,
    });
    return chatSession.sessionId;
  }

  const sessionId = opts.piSessionId || generateId();
  const client = await getDaemonClient();

  await client.pi.start({
    sessionId,
    tabId: opts.tabId,
    paneId: resolveAgentChatPaneId(opts.tabId, opts.paneId),
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    piSessionId: sessionId,
  });

  activePiSessions.set(opts.tabId, { rpcSessionId: sessionId, piSessionId: sessionId, unsubscribe: null });
  return sessionId;
}

/** Returns the tabId that currently owns the given Pi session, if any. */
export function findTabWithPiSession(piSessionId: string): string | undefined {
  for (const [tabId, session] of activePiSessions) {
    if (session.piSessionId === piSessionId) return tabId;
  }

  const sessions = agentChatStore.getState().sessionsByTabId;
  for (const [tabId, session] of Object.entries(sessions)) {
    if (session.sessionId === piSessionId) return tabId;
  }
  return undefined;
}

/** Updates the event unsubscribe handle for a Pi session. Cancels any previous subscription. */
export function setPiSessionUnsubscribe(tabId: string, unsubscribe: () => void): void {
  const session = activePiSessions.get(tabId);
  if (session) {
    session.unsubscribe?.();
    session.unsubscribe = unsubscribe;
  }
}

/** Publishes one chat tab's visibility so hidden tabs can flush less aggressively. */
export function setAgentChatStreamTabVisible(tabId: string, visible: boolean): void {
  setBufferedAgentChatStreamTabVisible(tabId, visible);
}

/** Stops the Pi RPC session for a tab. Called when the tab is closed. */
export async function stopPiSession(tabId: string): Promise<void> {
  const session = activePiSessions.get(tabId);
  if (!session) return;

  flushAgentChatStreamBuffer(tabId);
  disposeAgentChatStreamBuffer(tabId);
  activePiSessions.delete(tabId);
  session.unsubscribe?.();

  const client = await getDaemonClient();
  await client.pi.stop({ sessionId: session.rpcSessionId }).catch(() => {});

  agentChatStore.getState().removeSession(tabId);
}

/** Initializes the chat store entry for a tab. */
export function registerAgentSession(opts: { tabId: string; sessionId: string }): void {
  agentChatStore.getState().initSession(opts.tabId, opts.sessionId);
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
  flushAgentChatStreamBuffer(opts.tabId);

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
}

function resolveAgentChatPaneId(tabId: string, paneId: string | undefined): string {
  const normalizedPaneId = paneId?.trim();
  if (normalizedPaneId) {
    return normalizedPaneId;
  }

  return `pane-${tabId}`;
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
      agentChatStore.getState().setSessionState(tabId, "idle");
      break;

    case "message_start": {
      const msg = event.message as AgentMessage | undefined;
      if (msg && msg.role === "assistant") {
        flushAgentChatStreamBuffer(tabId);
        const content = Array.isArray(msg.content) ? cloneContentBlocks(msg.content as AgentContentBlock[]) : [];
        agentChatStore.getState().updateStreamingMessage(tabId, {
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
      if (snapshot?.role === "assistant") {
        const base = getLatestStreamingMessage(tabId);
        queueStreamingMessageUpdate(tabId, {
          ...snapshot,
          id: base?.id ?? snapshot.id ?? generateId(),
          content: Array.isArray(snapshot.content) ? cloneContentBlocks(snapshot.content) : [],
          startedAtMs: base?.startedAtMs,
          durationMs: base?.durationMs,
        });
        break;
      }

      const delta = event.assistantMessageEvent as AgentStreamEvent | undefined;
      const base = getLatestStreamingMessage(tabId);
      if (!delta || !base) break;

      const nextMessage = cloneAgentMessage(base);
      applyStreamDelta(nextMessage, delta);
      queueStreamingMessageUpdate(tabId, nextMessage);
      break;
    }

    case "message_end": {
      const msg = event.message as AgentMessage | undefined;
      if (!msg) break;

      flushAgentChatStreamBuffer(tabId);

      if (msg.role === "assistant") {
        const base = getLatestStreamingMessage(tabId);
        const startedAtMs = base?.startedAtMs ?? Date.now();
        agentChatStore.getState().updateStreamingMessage(tabId, {
          ...msg,
          id: base?.id ?? msg.id ?? generateId(),
          content: Array.isArray(msg.content) ? cloneContentBlocks(msg.content) : [],
          startedAtMs,
          durationMs: Math.max(0, Date.now() - startedAtMs),
        });
        agentChatStore.getState().finalizeStreamingMessage(tabId);
      } else {
        agentChatStore.getState().appendMessage(tabId, {
          ...msg,
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
        steering: queue.steering ?? [],
        followUp: queue.followUp ?? [],
      });
      break;
    }

    case "turn_start":
    case "turn_end":
    case "compaction_start":
    case "compaction_end":
      break;

    case "response":
      handlePiResponse(tabId, event);
      break;

    default:
      break;
  }
}

// ─── Streaming helpers ───────────────────────────────────────────────────────

function queueStreamingMessageUpdate(tabId: string, message: AgentMessage): void {
  queueAgentChatStreamMessage({
    tabId,
    message,
    onFlush: (nextMessage) => {
      agentChatStore.getState().updateStreamingMessage(tabId, nextMessage);
    },
  });
}

function getLatestStreamingMessage(tabId: string): AgentMessage | null {
  return (
    peekAgentChatStreamMessage(tabId) ?? agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage ?? null
  );
}

// ─── Response handler ─────────────────────────────────────────────────────────

function handlePiResponse(tabId: string, event: Record<string, unknown>): void {
  const command = event.command as string | undefined;
  const success = event.success as boolean | undefined;

  if (!success || !command) return;

  switch (command) {
    case "get_available_models": {
      const data = event.data as { models?: AgentModel[] } | undefined;
      agentChatStore.getState().setAvailableModels(tabId, data?.models ?? []);
      break;
    }
    case "get_state": {
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
      break;
    }
    case "get_messages": {
      const data = event.data as { messages?: AgentMessage[] } | undefined;
      for (const msg of data?.messages ?? []) {
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

// ─── Session history ─────────────────────────────────────────────────────────

/** Fetches past session summaries for the current working directory. */
export async function fetchSessionHistory(cwd: string): Promise<Rpc.PiSessionSummary[]> {
  const client = await getDaemonClient();
  return (await client.pi.listSessions({ cwd })) as Rpc.PiSessionSummary[];
}
