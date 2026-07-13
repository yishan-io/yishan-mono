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
import { tabStore } from "../store/tabStore";
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
  state: "starting" | "running" | "closing";
  closeRequested: boolean;
  startPromise: Promise<void> | null;
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
      state: "running",
      closeRequested: false,
      startPromise: null,
    });
    return chatSession.sessionId;
  }

  const sessionId = opts.piSessionId || generateId();
  const client = await getDaemonClient();
  const handle: PiSessionHandle = {
    rpcSessionId: sessionId,
    piSessionId: sessionId,
    unsubscribe: null,
    state: "starting",
    closeRequested: false,
    startPromise: null,
  };
  activePiSessions.set(opts.tabId, handle);

  const startPromise = client.pi
    .start({
      sessionId,
      tabId: opts.tabId,
      paneId: resolveAgentChatPaneId(opts.tabId, opts.paneId),
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      piSessionId: sessionId,
    })
    .then(async () => {
      handle.startPromise = null;

      if (handle.closeRequested) {
        await closePiSessionHandle(opts.tabId, handle);
        return;
      }

      handle.state = "running";
    })
    .catch((error) => {
      if (activePiSessions.get(opts.tabId) === handle) {
        activePiSessions.delete(opts.tabId);
      }
      throw error;
    });

  handle.startPromise = startPromise;
  await startPromise;
  return sessionId;
}

/** Returns the tabId that currently owns the given Pi session, if any. */
export function findTabWithPiSession(piSessionId: string): string | undefined {
  const openTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));

  for (const [tabId, session] of activePiSessions) {
    if (session.piSessionId === piSessionId && openTabIds.has(tabId)) {
      return tabId;
    }
  }

  const sessions = agentChatStore.getState().sessionsByTabId;
  for (const [tabId, session] of Object.entries(sessions)) {
    if (session.sessionId === piSessionId && openTabIds.has(tabId)) {
      return tabId;
    }
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
  flushAgentChatStreamBuffer(tabId);
  disposeAgentChatStreamBuffer(tabId);

  const session = activePiSessions.get(tabId);
  if (!session) {
    agentChatStore.getState().removeSession(tabId);
    return;
  }

  session.closeRequested = true;
  session.unsubscribe?.();
  session.unsubscribe = null;

  if (session.startPromise) {
    await session.startPromise.catch(() => {});
  }

  if (activePiSessions.get(tabId) !== session) {
    agentChatStore.getState().removeSession(tabId);
    return;
  }

  await closePiSessionHandle(tabId, session);
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

  agentChatStore.getState().clearTurnError(opts.tabId);

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

async function closePiSessionHandle(tabId: string, session: PiSessionHandle): Promise<void> {
  if (session.state === "closing") {
    return;
  }

  session.state = "closing";

  const client = await getDaemonClient();
  await Promise.resolve(client.pi.stop({ sessionId: session.rpcSessionId })).catch(() => {});

  if (activePiSessions.get(tabId) === session) {
    activePiSessions.delete(tabId);
  }
  agentChatStore.getState().removeSession(tabId);
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
      const snapshot = event.message as AgentMessage | undefined;
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
      handlePiResponse(tabId, sessionId, event);
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

function cloneIncomingAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: Array.isArray(message.content) ? cloneContentBlocks(message.content) : message.content,
  };
}

function getLatestStreamingMessage(tabId: string): AgentMessage | null {
  return (
    peekAgentChatStreamMessage(tabId) ?? agentChatStore.getState().sessionsByTabId[tabId]?.streamingMessage ?? null
  );
}

// ─── Response handler ─────────────────────────────────────────────────────────

function handlePiResponse(tabId: string, sessionId: string, event: Record<string, unknown>): void {
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
      void fetchAgentState({ tabId, sessionId });
      break;
    }
    case "get_available_models": {
      if (!success) break;
      const data = event.data as { models?: AgentModel[] } | undefined;
      agentChatStore.getState().setAvailableModels(tabId, data?.models ?? []);
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
      break;
    }
    case "get_messages": {
      if (!success) break;
      const data = event.data as { messages?: AgentMessage[] } | undefined;
      for (const msg of data?.messages ?? []) {
        agentChatStore.getState().appendMessage(tabId, {
          ...cloneIncomingAgentMessage(msg),
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
