import { getErrorMessage } from "../helpers/errorHelpers";
import { generateId } from "../helpers/generateId";
import type * as Rpc from "../rpc/daemonTypes";
import { getDaemonClient } from "../rpc/rpcTransport";
import { agentChatStore } from "../store/agentChatStore";
import type { AgentModel } from "../store/agentChatTypes";
import { tabStore } from "../store/tabStore";
import type { AgentChatSessionView } from "../store/types";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "./agentChatEventRouter";
import {
  handleAgentPiEvent,
  registerAgentSession,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./agentChatPiEventHelpers";
import {
  disposeAgentChatStreamBuffer,
  flushAgentChatStreamBuffer,
} from "./agentChatStreamBuffer";

// Re-export moved public APIs so existing callers need no import changes.
export {
  handleAgentPiEvent,
  registerAgentSession,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
} from "./agentChatPiEventHelpers";

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
    // If Pi startup is still in flight, wait before declaring the session ready.
    // Without this, a concurrent call (e.g. React Strict Mode remount) would
    // return the session ID and immediately try to send commands before Pi exists.
    if (existing.startPromise) {
      await existing.startPromise.catch(() => {
        // Startup failed — handle was removed. Fall through to create a new session.
      });
      if (activePiSessions.get(opts.tabId) !== existing) {
        return ensurePiSession(opts);
      }
    }
    return existing.sessionId;
  }

  const requestedSessionId = opts.sessionId?.trim();
  const chatSession = agentChatStore.getState().sessionsByTabId[opts.tabId];
  if (chatSession && !requestedSessionId) {
    const routerDispose = registerAgentChatEventRouter({
      tabId: opts.tabId,
      sessionId: chatSession.sessionId,
      onEvent: (payload) => handleAgentPiEvent(payload),
    });
    // Set the handle before awaiting so concurrent calls find it immediately.
    activePiSessions.set(opts.tabId, {
      sessionId: chatSession.sessionId,
      unsubscribe: routerDispose,
      state: "running",
      closeRequested: false,
      ownsSessionOnClose: true,
      startPromise: null,
    });
    await ensureAgentChatEventRouterReady();
    return chatSession.sessionId;
  }

  const sessionId = requestedSessionId || generateId();
  agentChatStore.getState().initSession(opts.tabId, sessionId);
  const routerDispose = registerAgentChatEventRouter({
    tabId: opts.tabId,
    sessionId,
    onEvent: (payload) => handleAgentPiEvent(payload),
  });
  // Place a deferred startPromise on the handle before any await so that
  // stopPiSession can await it even while startup is still in flight.
  let resolveDeferredStart: (() => void) | null = null;
  const deferredStartPromise = new Promise<void>((resolve) => {
    resolveDeferredStart = resolve;
  });
  const handle: PiSessionHandle = {
    sessionId,
    unsubscribe: routerDispose,
    state: "starting",
    closeRequested: false,
    ownsSessionOnClose: opts.sessionView !== "subagent-detail",
    startPromise: deferredStartPromise,
  };
  activePiSessions.set(opts.tabId, handle);
  const client = await getDaemonClient();
  await ensureAgentChatEventRouterReady();
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
      handle.unsubscribe?.();
      if (activePiSessions.get(opts.tabId) === handle) {
        activePiSessions.delete(opts.tabId);
      }
      throw error;
    });

  // Resolve the deferred startPromise when the real startPromise settles.
  startPromise.then(
    () => resolveDeferredStart?.(),
    () => resolveDeferredStart?.(),
  );
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

/** @deprecated Router registration owns the unsubscribe; use stopPiSession or clearPiSessionHandle. */
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

// ─── Private helpers ──────────────────────────────────────────────────────────

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
