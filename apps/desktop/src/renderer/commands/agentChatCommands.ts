import { getErrorMessage } from "../helpers/errorHelpers";
import { generateId } from "../helpers/generateId";
import type * as Rpc from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import type {
  AgentContentBlock,
  AgentMessage,
  AgentModel,
  AgentPendingUiOption,
  AgentPendingUiRequest,
  AgentQueueState,
  AgentStreamEvent,
  AgentThinkingSignature,
} from "../store/agentChatTypes";
import { tabStore } from "../store/tabStore";
import type { AgentChatSessionView } from "../store/types";
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
  sessionId: string;
  unsubscribe: (() => void) | null;
  state: "starting" | "running" | "closing";
  closeRequested: boolean;
  ownsSessionOnClose: boolean;
  startPromise: Promise<void> | null;
};

const activePiSessions = new Map<string, PiSessionHandle>();
const PI_SESSION_EXISTS_RPC_CODE = -32003;

/**
 * Ensures a Pi RPC session exists for a tab. Idempotent — subsequent calls
 * for the same tabId return the existing session.
 */
export async function ensurePiSession(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView?: AgentChatSessionView;
  paneId?: string;
}): Promise<string> {
  const existing = activePiSessions.get(opts.tabId);
  if (existing) {
    return existing.sessionId;
  }

  const requestedSessionId = opts.sessionId?.trim();
  const chatSession = agentChatStore.getState().sessionsByTabId[opts.tabId];
  if (chatSession && !requestedSessionId) {
    activePiSessions.set(opts.tabId, {
      sessionId: chatSession.sessionId,
      unsubscribe: null,
      state: "running",
      closeRequested: false,
      ownsSessionOnClose: true,
      startPromise: null,
    });
    return chatSession.sessionId;
  }

  const sessionId = requestedSessionId || generateId();
  const client = await getDaemonClient();
  const handle: PiSessionHandle = {
    sessionId,
    unsubscribe: null,
    state: "starting",
    closeRequested: false,
    ownsSessionOnClose: opts.sessionView !== "subagent-detail",
    startPromise: null,
  };
  activePiSessions.set(opts.tabId, handle);

  const startPiSession = async (): Promise<{ sessionId: string } | { ok: boolean }> => {
    return await client.pi.start({
      sessionId,
      tabId: opts.tabId,
      paneId: resolveAgentChatPaneId(opts.tabId, opts.paneId),
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
    });
  };

  const startPromise = startPiSession()
    .catch(async (error) => {
      if (!requestedSessionId || !isPiSessionAlreadyRunningError(error)) {
        throw error;
      }
      return await client.pi.attach({
        sessionId,
        tabId: opts.tabId,
        workspaceId: opts.workspaceId,
        cwd: opts.cwd,
      });
    })
    .then(async () => {
      handle.startPromise = null;
      tabStore.getState().setAgentChatTabSession({
        tabId: opts.tabId,
        sessionId,
      });

      if (handle.closeRequested) {
        if (handle.ownsSessionOnClose) {
          await closePiSessionHandle(opts.tabId, handle);
        } else {
          releasePiSessionHandle(opts.tabId, handle);
        }
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

/** Returns the tabId that currently owns the given agent-chat session, if any. */
export function findTabWithSession(sessionId: string): string | undefined {
  const openTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));

  for (const [tabId, session] of activePiSessions) {
    if (session.sessionId === sessionId && openTabIds.has(tabId)) {
      return tabId;
    }
  }

  const sessions = agentChatStore.getState().sessionsByTabId;
  for (const [tabId, session] of Object.entries(sessions)) {
    if (session.sessionId === sessionId && openTabIds.has(tabId)) {
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

/** Drops one local Pi-session handle so future startup can recreate or reattach it. */
export function clearPiSessionHandle(tabId: string): void {
  const session = activePiSessions.get(tabId);
  session?.unsubscribe?.();
  activePiSessions.delete(tabId);
}

/** Rebinds one live Pi session to the current daemon WebSocket connection. */
export async function reattachPiSession(tabId: string): Promise<void> {
  const session = activePiSessions.get(tabId);
  if (!session || session.state === "closing") {
    return;
  }

  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId && candidate.kind === "agent-chat");
  const client = await getDaemonClient();
  await client.pi.attach({
    sessionId: session.sessionId,
    tabId,
    workspaceId: tab?.workspaceId,
    cwd: tab?.kind === "agent-chat" ? tab.data.cwd : undefined,
  });
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
    const fallbackTab = tabStore.getState().tabs.find((tab) => tab.id === tabId && tab.kind === "agent-chat");
    const isReadOnlySubagentDetail =
      fallbackTab?.kind === "agent-chat" && fallbackTab.data.sessionView === "subagent-detail";
    const fallbackSessionId =
      agentChatStore.getState().sessionsByTabId[tabId]?.sessionId ??
      (fallbackTab?.kind === "agent-chat" ? fallbackTab.data.sessionId : undefined);

    if (fallbackSessionId && !isReadOnlySubagentDetail) {
      const client = await getDaemonClient();
      await Promise.resolve(client.pi.stop({ sessionId: fallbackSessionId })).catch(() => {});
    }

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

  if (!session.ownsSessionOnClose) {
    releasePiSessionHandle(tabId, session);
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

function isPiSessionAlreadyRunningError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === PI_SESSION_EXISTS_RPC_CODE) {
    return true;
  }

  return getErrorMessage(error).includes("agent session already exists");
}

function resolveAgentChatPaneId(tabId: string, paneId: string | undefined): string {
  const normalizedPaneId = paneId?.trim();
  if (normalizedPaneId) {
    return normalizedPaneId;
  }

  return `pane-${tabId}`;
}

function releasePiSessionHandle(tabId: string, session: PiSessionHandle): void {
  if (activePiSessions.get(tabId) === session) {
    activePiSessions.delete(tabId);
  }
  agentChatStore.getState().removeSession(tabId);
}

async function closePiSessionHandle(tabId: string, session: PiSessionHandle): Promise<void> {
  if (session.state === "closing") {
    return;
  }

  session.state = "closing";

  const client = await getDaemonClient();
  await Promise.resolve(client.pi.stop({ sessionId: session.sessionId })).catch(() => {});

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
        steering: queue.steering ?? [],
        followUp: queue.followUp ?? [],
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

// ─── Streaming helpers ───────────────────────────────────────────────────────

function parseSubagentProgressTargets(
  event: Record<string, unknown>,
): Array<{ agentName: string; agentId: string; status: string; childSessionId?: string }> | null {
  if (event.method !== "setWidget" || event.widgetKey !== "pi-subagents-progress") {
    return null;
  }

  const widgetLines = event.widgetLines;
  if (widgetLines === undefined) {
    return [];
  }
  if (!Array.isArray(widgetLines)) {
    return null;
  }

  const targets = widgetLines
    .map((line) => parseSubagentProgressTargetLine(typeof line === "string" ? line : ""))
    .filter(
      (target): target is { agentName: string; agentId: string; status: string; childSessionId?: string } =>
        target !== null,
    );
  return targets;
}

function parseSubagentProgressTargetLine(
  line: string,
): { agentName: string; agentId: string; status: string; childSessionId?: string } | null {
  const normalizedLine = line.replace(/<[^>]+>/g, "").trim();
  const match = normalizedLine.match(
    /^\S+\s+(.+?)\s+·\s+(queued|starting|running)\s+·\s+(?:fg|bg)\s+·\s+(agent-\S+)(?:\s+·\s+(\S+))?$/,
  );
  if (!match) {
    return null;
  }

  const [, agentName, status, agentId, childSessionId] = match;
  if (!agentName || !status || !agentId) {
    return null;
  }

  return { agentName, status, agentId, childSessionId: childSessionId || undefined };
}

type SubagentLiveTranscript = {
  childSessionId: string;
  messages: AgentMessage[];
};

function parseSubagentLiveTranscripts(event: Record<string, unknown>): SubagentLiveTranscript[] | null {
  if (event.method !== "setWidget" || event.widgetKey !== "pi-subagents-live-transcripts") {
    return null;
  }

  const widgetLines = event.widgetLines;
  if (widgetLines === undefined) {
    return [];
  }
  if (!Array.isArray(widgetLines) || widgetLines.length !== 1 || typeof widgetLines[0] !== "string") {
    return null;
  }

  try {
    const payload = JSON.parse(widgetLines[0]) as { version?: unknown; agents?: unknown };
    if (payload.version !== 1 || !Array.isArray(payload.agents)) {
      return null;
    }

    return payload.agents.flatMap((agent): SubagentLiveTranscript[] => {
      if (!agent || typeof agent !== "object") {
        return [];
      }
      const { childSessionId, messages } = agent as { childSessionId?: unknown; messages?: unknown };
      if (typeof childSessionId !== "string" || childSessionId.trim().length === 0 || !Array.isArray(messages)) {
        return [];
      }

      const normalizedMessages = messages.flatMap((message) => {
        const normalizedMessage = normalizeIncomingAgentMessage(message);
        return normalizedMessage ? [normalizedMessage] : [];
      });
      return [{ childSessionId, messages: normalizedMessages }];
    });
  } catch {
    return null;
  }
}

function applySubagentLiveTranscripts(parentTabId: string, transcripts: SubagentLiveTranscript[]): void {
  agentChatStore
    .getState()
    .setSubagentLiveTranscripts(
      parentTabId,
      Object.fromEntries(transcripts.map((transcript) => [transcript.childSessionId, transcript.messages])),
    );

  for (const transcript of transcripts) {
    const detailTab = tabStore.getState().tabs.find((tab) => {
      return (
        tab.kind === "agent-chat" &&
        tab.data.sessionView === "subagent-detail" &&
        tab.data.sessionId?.trim() === transcript.childSessionId
      );
    });
    if (!detailTab) {
      continue;
    }

    agentChatStore.getState().replaceMessages(detailTab.id, transcript.messages);
  }
}

function queueStreamingMessageUpdate(tabId: string, message: AgentMessage): void {
  queueAgentChatStreamMessage({
    tabId,
    message,
    onFlush: (nextMessage) => {
      agentChatStore.getState().updateStreamingMessage(tabId, nextMessage);
    },
  });
}

function normalizeIncomingAgentMessage(rawMessage: unknown): AgentMessage | null {
  if (!isRecord(rawMessage) || !isAgentMessageRole(rawMessage.role)) {
    return null;
  }

  const content = normalizeMessageContent(rawMessage.content);
  const message: AgentMessage = {
    id: typeof rawMessage.id === "string" ? rawMessage.id : generateId(),
    role: rawMessage.role,
    content,
  };

  if (typeof rawMessage.customType === "string") message.customType = rawMessage.customType;
  if (typeof rawMessage.display === "boolean") message.display = rawMessage.display;
  if (typeof rawMessage.toolCallId === "string") message.toolCallId = rawMessage.toolCallId;
  if (typeof rawMessage.toolName === "string") message.toolName = rawMessage.toolName;
  if (typeof rawMessage.isError === "boolean") message.isError = rawMessage.isError;
  const details = normalizeMessageDetails(rawMessage.details);
  if (details) message.details = details;
  const usage = normalizeMessageUsage(rawMessage.usage);
  if (usage) message.usage = usage;
  if (typeof rawMessage.stopReason === "string") message.stopReason = rawMessage.stopReason;
  if (typeof rawMessage.errorMessage === "string") message.errorMessage = rawMessage.errorMessage;
  if (typeof rawMessage.timestamp === "number") message.timestamp = rawMessage.timestamp;
  if (typeof rawMessage.startedAtMs === "number") message.startedAtMs = rawMessage.startedAtMs;
  if (typeof rawMessage.durationMs === "number") message.durationMs = rawMessage.durationMs;

  return message;
}

function normalizeMessageDetails(details: unknown): Record<string, unknown> | undefined {
  if (isRecord(details)) {
    return details;
  }
  if (typeof details !== "string") {
    return undefined;
  }

  try {
    const parsedDetails: unknown = JSON.parse(details);
    return isRecord(parsedDetails) ? parsedDetails : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMessageContent(content: unknown): string | AgentContentBlock[] {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content.flatMap((block) => {
    const normalizedBlock = normalizeContentBlock(block);
    return normalizedBlock ? [normalizedBlock] : [];
  });
}

function normalizeContentBlock(rawBlock: unknown): AgentContentBlock | null {
  if (!isRecord(rawBlock) || typeof rawBlock.type !== "string") {
    return null;
  }

  if (rawBlock.type === "text" && typeof rawBlock.text === "string") {
    return { type: "text", text: rawBlock.text };
  }
  if (rawBlock.type === "thinking" && typeof rawBlock.thinking === "string") {
    const thinkingSignature = normalizeThinkingSignature(rawBlock.thinkingSignature);
    return { type: "thinking", thinking: rawBlock.thinking, thinkingSignature };
  }
  if (
    rawBlock.type === "toolCall" &&
    typeof rawBlock.id === "string" &&
    typeof rawBlock.name === "string" &&
    isRecord(rawBlock.arguments)
  ) {
    return { type: "toolCall", id: rawBlock.id, name: rawBlock.name, arguments: { ...rawBlock.arguments } };
  }

  return null;
}

function normalizeThinkingSignature(signature: unknown): string | AgentThinkingSignature | undefined {
  if (typeof signature === "string") {
    return signature;
  }
  if (!isRecord(signature)) {
    return undefined;
  }

  const normalizedSignature: AgentThinkingSignature = {};
  if (typeof signature.id === "string") normalizedSignature.id = signature.id;
  if (typeof signature.type === "string") normalizedSignature.type = signature.type;
  if (Array.isArray(signature.summary)) {
    normalizedSignature.summary = signature.summary.flatMap((summaryItem) => {
      if (!isRecord(summaryItem) || typeof summaryItem.type !== "string" || typeof summaryItem.text !== "string") {
        return [];
      }
      return [{ type: summaryItem.type, text: summaryItem.text }];
    });
  }
  return normalizedSignature;
}

function normalizeMessageUsage(usage: unknown): AgentMessage["usage"] | undefined {
  if (!isRecord(usage) || typeof usage.input !== "number" || typeof usage.output !== "number") {
    return undefined;
  }

  const normalizedUsage: NonNullable<AgentMessage["usage"]> = { input: usage.input, output: usage.output };
  if (typeof usage.cacheRead === "number") normalizedUsage.cacheRead = usage.cacheRead;
  if (typeof usage.cacheWrite === "number") normalizedUsage.cacheWrite = usage.cacheWrite;
  if (typeof usage.reasoning === "number") normalizedUsage.reasoning = usage.reasoning;
  if (typeof usage.total === "number") normalizedUsage.total = usage.total;
  if (typeof usage.totalTokens === "number") normalizedUsage.totalTokens = usage.totalTokens;
  if (isRecord(usage.cost)) {
    const cost: NonNullable<NonNullable<AgentMessage["usage"]>["cost"]> = {};
    if (typeof usage.cost.input === "number") cost.input = usage.cost.input;
    if (typeof usage.cost.output === "number") cost.output = usage.cost.output;
    if (typeof usage.cost.cacheRead === "number") cost.cacheRead = usage.cost.cacheRead;
    if (typeof usage.cost.cacheWrite === "number") cost.cacheWrite = usage.cost.cacheWrite;
    if (typeof usage.cost.total === "number") cost.total = usage.cost.total;
    normalizedUsage.cost = cost;
  }
  return normalizedUsage;
}

function isAgentMessageRole(role: unknown): role is AgentMessage["role"] {
  return role === "user" || role === "assistant" || role === "toolResult" || role === "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_STREAM_CONTENT_INDEX = 10_000;

function parseAgentStreamEvent(rawEvent: unknown): AgentStreamEvent | null {
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
    case "toolcall_end":
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
      return {
        type: "toolcall_end",
        contentIndex: rawEvent.contentIndex,
        toolCallId: rawEvent.toolCallId,
        toolCall: {
          id: rawEvent.toolCall.id,
          name: rawEvent.toolCall.name,
          arguments: rawEvent.toolCall.arguments,
        },
      };
    default:
      return null;
  }
}

function isValidStreamContentIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STREAM_CONTENT_INDEX;
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

const ASK_USER_FREEFORM_SENTINEL = "__ask_user_freeform__";
const MULTI_SELECT_INSTRUCTION = "Comma-separated selections by number or exact title";
const MULTI_SELECT_FREEFORM_HINT = "Type your own answer instead of selecting options";
const RPC_OPTION_DESCRIPTION_INDENT = "   ";

function parsePendingUiRequest(event: Record<string, unknown>): AgentPendingUiRequest | null {
  const id = typeof event.id === "string" ? event.id : null;
  const method = typeof event.method === "string" ? event.method : null;
  const rawTitle = typeof event.title === "string" ? event.title : null;

  if (!id || !rawTitle) {
    return null;
  }

  if (method !== "select" && method !== "confirm" && method !== "input" && method !== "editor") {
    return null;
  }

  const optionStrings = Array.isArray(event.options)
    ? event.options.filter((option): option is string => typeof option === "string")
    : undefined;

  if (method === "select") {
    const allowFreeform = optionStrings?.includes(ASK_USER_FREEFORM_SENTINEL) ?? false;
    const normalizedOptions = (optionStrings ?? [])
      .filter((option) => option !== ASK_USER_FREEFORM_SENTINEL)
      .map((option) => ({ value: option, label: option }));
    const parsedSelectPrompt = parseSelectPromptMetadata(rawTitle, normalizedOptions);

    return {
      id,
      method,
      title: parsedSelectPrompt?.question ?? rawTitle,
      message: typeof event.message === "string" ? event.message : undefined,
      options: parsedSelectPrompt?.options ?? normalizedOptions,
      placeholder: typeof event.placeholder === "string" ? event.placeholder : undefined,
      prefill: typeof event.prefill === "string" ? event.prefill : undefined,
      allowFreeform,
      selectionMode: "single",
    };
  }

  if (method === "input") {
    const parsedMultiSelectPrompt = parseMultiSelectPromptMetadata(rawTitle);
    if (parsedMultiSelectPrompt) {
      return {
        id,
        method,
        title: parsedMultiSelectPrompt.question,
        message: typeof event.message === "string" ? event.message : undefined,
        options: parsedMultiSelectPrompt.options,
        placeholder: typeof event.placeholder === "string" ? event.placeholder : undefined,
        prefill: typeof event.prefill === "string" ? event.prefill : undefined,
        allowFreeform: parsedMultiSelectPrompt.allowFreeform,
        selectionMode: "multiple",
      };
    }
  }

  return {
    id,
    method,
    title: rawTitle,
    message: typeof event.message === "string" ? event.message : undefined,
    options: optionStrings?.map((option) => ({ value: option, label: option })),
    placeholder: typeof event.placeholder === "string" ? event.placeholder : undefined,
    prefill: typeof event.prefill === "string" ? event.prefill : undefined,
  };
}

function parseSelectPromptMetadata(
  title: string,
  options: AgentPendingUiOption[],
): { question: string; options: AgentPendingUiOption[] } | null {
  if (options.length === 0) {
    return null;
  }

  const lines = title.split("\n");
  const firstOptionIndex = lines.findIndex((line) => line.trim() === `1. ${options[0]?.value}`);
  if (firstOptionIndex <= -1) {
    return null;
  }

  const parsedOptions = parsePromptOptions(lines.slice(firstOptionIndex));
  if (parsedOptions.length === 0 || !options.every((option, index) => parsedOptions[index]?.label === option.value)) {
    return null;
  }

  return {
    question: lines.slice(0, firstOptionIndex).join("\n").trim() || title,
    options: parsedOptions.map((option, index) => ({
      value: options[index]?.value ?? option.label,
      label: option.label,
      description: option.description,
    })),
  };
}

function parseMultiSelectPromptMetadata(
  title: string,
): { question: string; options: AgentPendingUiOption[]; allowFreeform: boolean } | null {
  if (!title.includes(MULTI_SELECT_INSTRUCTION)) {
    return null;
  }

  const lines = title.split("\n");
  const options = parsePromptOptions(lines);
  if (options.length === 0) {
    return null;
  }

  const instructionIndex = lines.findIndex((line) => line.trim() === MULTI_SELECT_INSTRUCTION);
  const allowFreeform = lines.some((line) => line.trim() === MULTI_SELECT_FREEFORM_HINT);
  const question = (instructionIndex <= -1 ? lines : lines.slice(0, instructionIndex))
    .filter(
      (line) =>
        !/^\d+\.\s+.+$/.test(line.trim()) &&
        !line.startsWith(RPC_OPTION_DESCRIPTION_INDENT) &&
        line.trim() !== MULTI_SELECT_FREEFORM_HINT,
    )
    .join("\n")
    .trim();

  return {
    question: question || title,
    options: options.map((option) => ({
      index: option.index,
      value: option.label,
      label: option.label,
      description: option.description,
    })),
    allowFreeform,
  };
}

function parsePromptOptions(lines: string[]): Array<{ index: number; label: string; description?: string }> {
  const parsedOptions: Array<{ index: number; label: string; description?: string }> = [];
  let activeOption: { index: number; label: string; description?: string } | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const optionMatch = /^(?<index>\d+)\.\s+(?<label>.+)$/.exec(trimmedLine);
    if (optionMatch?.groups?.index && optionMatch.groups.label) {
      const index = Number.parseInt(optionMatch.groups.index, 10);
      if (!Number.isInteger(index) || index < 1) {
        continue;
      }

      activeOption = { index, label: optionMatch.groups.label };
      parsedOptions.push(activeOption);
      continue;
    }

    if (!activeOption || !line.startsWith(RPC_OPTION_DESCRIPTION_INDENT)) {
      continue;
    }

    const descriptionLine = line.trim();
    activeOption.description = activeOption.description
      ? `${activeOption.description}\n${descriptionLine}`
      : descriptionLine;
  }

  return parsedOptions;
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
      const models = data?.models ?? [];
      console.debug("[agentChatCommands] get_available_models response", {
        tabId,
        sessionId,
        modelCount: models.length,
        providers: Array.from(new Set(models.map((model) => model.provider ?? ""))).sort(),
        models,
      });
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

// ─── Session history ─────────────────────────────────────────────────────────

/** Fetches past session summaries for the current working directory. */
export async function fetchSessionHistory(cwd: string): Promise<Rpc.PiSessionSummary[]> {
  const client = await getDaemonClient();
  return (await client.pi.listSessions({ cwd })) as Rpc.PiSessionSummary[];
}

/** Fetches live Pi sessions currently held by the daemon. */
export async function listActivePiSessions(): Promise<Rpc.PiActiveSessionSummary[]> {
  const client = await getDaemonClient();
  return (await client.pi.listActiveSessions({})) as Rpc.PiActiveSessionSummary[];
}
