import { tabStore } from "@renderer/domains/workbench";
import { bindAgentChatTabSession } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { delay } from "@shared/async/delay";
/**
 * AgentSessionRuntime — one owner for Pi session handles and lifecycle races.
 *
 * Owns the module-level `activePiSessions`/`closingSessions` maps, the
 * start/attach/stop/reopen races, and the state-hydration sends
 * (fetchAgentState / fetchAgentMessages / fetchAgentModels / stats refresh)
 * so recovery sequences can compose them without a commands↔runtime cycle.
 *
 * React mounts attach UI to this Runtime; they do not own Pi process
 * lifecycle. UI-intent commands (`features/agent/commands/agentChatCommands.ts`)
 * delegate here; the Pi event decode adapter lives in
 * `features/agent/subscriptions/agentChatEventRouter.ts` and the reduction in
 * `features/agent/subscriptions/agentChatPiEventHandler.ts`.
 *
 * Pi RPC sessions outlive React component mounts so that Strict Mode
 * double-mounts reuse the same Pi process instead of starting a second one.
 */
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { generateId } from "@shared/ids/generateId";
import {
  abortAgentSession as abortAgentSessionProcedure,
  attachAgentSession as attachAgentSessionProcedure,
  disposeAgentSession as disposeAgentSessionProcedure,
  promptAgentSession as promptAgentSessionProcedure,
  sendPiCompatibilityCommand as sendPiCompatibilityCommandProcedure,
  startAgentSession as startAgentSessionProcedure,
} from "../daemon/daemonAgentProcedures";
import { agentChatStore } from "../state/agentChatStore";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import { handleAgentPiEvent } from "../subscriptions/agentChatPiEventHandler";
import {
  clearAgentChatSessionStatsSequence,
  refreshAgentSessionStats as refreshPiAgentSessionStatsCompatibility,
} from "../subscriptions/agentChatPiEventShared";
import { disposeAgentChatStreamBuffer, flushAgentChatStreamBuffer } from "./agentChatStreamBuffer";

type AgentRuntimeSessionRecord = {
  sessionId: string;
  workspaceId: string;
  cwd: string;
  ownsSessionOnClose: boolean;
};

type PiSessionHandle = AgentRuntimeSessionRecord & {
  unsubscribe: (() => void) | null;
  state: "starting" | "running" | "closing";
  closeRequested: boolean;
  startPromise: Promise<void> | null;
};
const activePiSessions = new Map<string, PiSessionHandle>();
const runtimeSessionRecords = new Map<string, AgentRuntimeSessionRecord>();
// closingSessions tracks in-flight agent.dispose teardowns by session id so a fast
// reopen of the same history session waits for the teardown instead of racing
// it (agent.start would hit ErrSessionExists and attach to a process being killed).
const closingSessions = new Map<string, Promise<void>>();
const PI_SESSION_EXISTS_RPC_CODE = -32003;
// CLOSING_SESSION_WAIT_TIMEOUT_MS bounds how long a reopen waits for an
// in-flight pi.stop of the same session id before proceeding anyway.
const CLOSING_SESSION_WAIT_TIMEOUT_MS = 6_000;
/**
 * Ensures a Pi RPC session exists for a tab. Idempotent — subsequent calls
 * for the same tabId return the existing session.
 *
 * Returns whether the session process was already alive (attached or reused)
 * rather than freshly started, so callers can classify pre-existing transcript
 * history as interrupted when the previous owner process is gone.
 */
export async function ensurePiSession(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView?: AgentChatSessionView;
  paneId?: string;
}): Promise<{ sessionId: string; attached: boolean }> {
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
    return { sessionId: existing.sessionId, attached: true };
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
    const runtimeRecord: AgentRuntimeSessionRecord = {
      sessionId: chatSession.sessionId,
      workspaceId: opts.workspaceId,
      cwd: opts.cwd,
      ownsSessionOnClose: true,
    };
    runtimeSessionRecords.set(opts.tabId, runtimeRecord);
    activePiSessions.set(opts.tabId, {
      ...runtimeRecord,
      unsubscribe: routerDispose,
      state: "running",
      closeRequested: false,
      startPromise: null,
    });
    await ensureAgentChatEventRouterReady();
    return { sessionId: chatSession.sessionId, attached: true };
  }

  const sessionId = requestedSessionId || generateId();
  agentChatStore.getState().initSession(opts.tabId, sessionId);
  let didAttach = false;
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
  const runtimeRecord: AgentRuntimeSessionRecord = {
    sessionId,
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    ownsSessionOnClose: opts.sessionView !== "subagent-detail",
  };
  runtimeSessionRecords.set(opts.tabId, runtimeRecord);
  const handle: PiSessionHandle = {
    ...runtimeRecord,
    unsubscribe: routerDispose,
    state: "starting",
    closeRequested: false,
    startPromise: deferredStartPromise,
  };
  activePiSessions.set(opts.tabId, handle);
  await ensureAgentChatEventRouterReady();
  // A previous tab may have just been closed for this session id; wait for its
  // teardown to finish so agent.start spawns a fresh process instead of falling
  // back to attaching to a process that is being killed.
  await closingSessions.get(sessionId)?.catch(() => undefined);
  const startAgentSession = async (): Promise<{ sessionId: string }> => {
    return await startAgentSessionProcedure({
      runtime: "pi",
      sessionId,
      tabId: opts.tabId,
      paneId: resolveAgentChatPaneId(opts.tabId, opts.paneId),
      workspaceId: runtimeRecord.workspaceId,
      cwd: runtimeRecord.cwd,
    });
  };

  const startPromise = startAgentSession()
    .catch(async (error) => {
      if (!requestedSessionId || !isPiSessionAlreadyRunningError(error)) {
        throw error;
      }
      didAttach = true;
      return await attachAgentSessionProcedure({
        runtime: "pi",
        sessionId,
        tabId: opts.tabId,
        workspaceId: runtimeRecord.workspaceId,
        cwd: runtimeRecord.cwd,
      });
    })
    .then(async () => {
      handle.startPromise = null;
      bindAgentChatTabSession({
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
      runtimeSessionRecords.delete(opts.tabId);
      throw error;
    });

  // Resolve the deferred startPromise when the real startPromise settles.
  startPromise.then(
    () => resolveDeferredStart?.(),
    () => resolveDeferredStart?.(),
  );
  await startPromise;
  return { sessionId, attached: didAttach };
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

  await attachAgentSessionProcedure({
    runtime: "pi",
    sessionId: session.sessionId,
    tabId,
    workspaceId: session.workspaceId,
    cwd: session.cwd,
  });
  // Events can be missed while disconnected. Let the immediately following
  // get_state response establish the current idle/running/compacting phase.
  agentChatStore.getState().setSessionState(tabId, "starting");
}
/** Sends one semantic prompt through the neutral Pi runtime façade. */
export async function promptAgentSession(opts: {
  tabId: string;
  sessionId: string;
  message: string;
  streamingBehavior?: string;
}): Promise<void> {
  const runtimeRecord = requireRuntimeSessionRecord(opts.tabId, opts.sessionId);
  await promptAgentSessionProcedure({
    runtime: "pi",
    sessionId: opts.sessionId,
    workspaceId: runtimeRecord.workspaceId,
    cwd: runtimeRecord.cwd,
    message: opts.message,
    streamingBehavior: opts.streamingBehavior,
  });
}

/** Aborts the active turn through the neutral Pi runtime façade without disposing it. */
export async function abortAgentSession(tabId: string, sessionId: string): Promise<void> {
  const runtimeRecord = requireRuntimeSessionRecord(tabId, sessionId);
  await abortAgentSessionProcedure({
    runtime: "pi",
    sessionId,
    workspaceId: runtimeRecord.workspaceId,
    cwd: runtimeRecord.cwd,
  });
}

/** Stops the Pi RPC session for a tab. Called when the tab is closed. */
export async function stopPiSession(tabId: string): Promise<void> {
  flushAgentChatStreamBuffer(tabId);
  disposeAgentChatStreamBuffer(tabId);

  const session = activePiSessions.get(tabId);
  if (!session) {
    const fallbackTab = tabStore.getState().tabs.find((tab) => tab.id === tabId);
    const isReadOnlySubagentDetail =
      fallbackTab?.kind === "agent-chat" && fallbackTab.data.sessionView === "subagent-detail";
    const fallbackSessionId =
      agentChatStore.getState().sessionsByTabId[tabId]?.sessionId ??
      (fallbackTab?.kind === "agent-chat" ? fallbackTab.data.sessionId : undefined);

    const runtimeRecord = runtimeSessionRecords.get(tabId);
    if (fallbackSessionId && runtimeRecord?.sessionId === fallbackSessionId && !isReadOnlySubagentDetail) {
      const disposePromise = Promise.resolve(
        disposeAgentSessionProcedure({
          runtime: "pi",
          sessionId: fallbackSessionId,
          workspaceId: runtimeRecord.workspaceId,
          cwd: runtimeRecord.cwd,
        }),
      ).catch(() => {});
      trackClosingSession(fallbackSessionId, disposePromise);
      await disposePromise;
    }

    agentChatStore.getState().removeSession(tabId);
    runtimeSessionRecords.delete(tabId);
    if (fallbackSessionId) {
      clearAgentChatSessionStatsSequence(fallbackSessionId);
    }
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
    clearAgentChatSessionStatsSequence(session.sessionId);
    return;
  }

  if (!session.ownsSessionOnClose) {
    releasePiSessionHandle(tabId, session);
    return;
  }

  await closePiSessionHandle(tabId, session);
}

/** Fetches available models from the pi session. Result arrives via agent.pi.event. */
export async function fetchPiAgentModelsCompatibility(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  await sendPiCompatibilityCommandProcedure({
    sessionId: opts.sessionId,
    command: { type: "get_available_models" },
  });
}

/** Fetches session state (model, thinkingLevel) from the pi session. */
export async function fetchPiAgentStateCompatibility(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  await sendPiCompatibilityCommandProcedure({
    sessionId: opts.sessionId,
    command: { type: "get_state" },
  });
}

/** Fetches all conversation messages from the pi session. */
export async function fetchPiAgentMessagesCompatibility(opts: {
  tabId: string;
  sessionId: string;
}): Promise<void> {
  await sendPiCompatibilityCommandProcedure({
    sessionId: opts.sessionId,
    command: { type: "get_messages" },
  });
}

/**
 * Recovers one agent-chat tab after a daemon reconnect: reattaches the live
 * session, rehydrates state/messages/models/stats, and falls back to a fresh
 * start when the daemon no longer holds the session. Owned by the Runtime so
 * React mounts never run the recovery race themselves.
 */
export async function recoverAgentSessionAfterReconnect(opts: {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId: string;
  sessionView: AgentChatSessionView;
  paneId?: string;
}): Promise<void> {
  try {
    await reattachPiSession(opts.tabId);
    // The process survived the connection drop; rows stay live.
    agentChatStore.getState().setSubagentSessionEndedAt(opts.tabId, null);
    await fetchPiAgentStateCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
    await fetchPiAgentMessagesCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
    await fetchPiAgentModelsCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
    await refreshPiAgentSessionStatsCompatibility(opts.sessionId);
  } catch {
    // The daemon no longer holds the session (e.g. it was re-run and started
    // fresh). Drop the stale handle and re-start the session so the tab heals
    // itself instead of staying broken.
    clearPiSessionHandle(opts.tabId);
    try {
      const { attached } = await ensurePiSession({
        tabId: opts.tabId,
        workspaceId: opts.workspaceId,
        cwd: opts.cwd,
        sessionId: opts.sessionId,
        sessionView: opts.sessionView,
        paneId: opts.paneId,
      });
      // Fresh start resets the session; classify pre-existing rows as
      // interrupted when the previous process is gone.
      agentChatStore.getState().setSubagentSessionEndedAt(opts.tabId, attached ? null : Date.now());
      await fetchPiAgentStateCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
      await fetchPiAgentMessagesCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
      await fetchPiAgentModelsCompatibility({ tabId: opts.tabId, sessionId: opts.sessionId });
      await refreshPiAgentSessionStatsCompatibility(opts.sessionId);
    } catch (recoveryError) {
      agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(recoveryError));
    }
  }
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
/** Records an in-flight agent.dispose so a concurrent reopen can await it. */
function trackClosingSession(sessionId: string, stopPromise: Promise<unknown>): void {
  // Bound the wait: a hung dispose RPC (transport timeout is 30s) must not stall
  // reopens of the same session id; the daemon serializes start-during-stop
  // itself, so the frontend only needs a responsive fast path.
  const tracked = Promise.race([stopPromise.then(() => undefined), delay(CLOSING_SESSION_WAIT_TIMEOUT_MS)]).catch(
    () => undefined,
  );
  closingSessions.set(sessionId, tracked);
  void tracked.finally(() => {
    if (closingSessions.get(sessionId) === tracked) {
      closingSessions.delete(sessionId);
    }
  });
}

function requireRuntimeSessionRecord(tabId: string, sessionId: string): AgentRuntimeSessionRecord {
  const runtimeRecord = runtimeSessionRecords.get(tabId);
  if (runtimeRecord?.sessionId === sessionId) {
    return runtimeRecord;
  }
  throw new Error(`No runtime session record for agent-chat tab ${tabId}`);
}

function releasePiSessionHandle(tabId: string, session: PiSessionHandle): void {
  if (activePiSessions.get(tabId) === session) {
    activePiSessions.delete(tabId);
  }
  agentChatStore.getState().removeSession(tabId);
  runtimeSessionRecords.delete(tabId);
  clearAgentChatSessionStatsSequence(session.sessionId);
}

async function closePiSessionHandle(tabId: string, session: PiSessionHandle): Promise<void> {
  if (session.state === "closing") {
    return;
  }
  session.state = "closing";

  const stopPromise = Promise.resolve(
    disposeAgentSessionProcedure({
      runtime: "pi",
      sessionId: session.sessionId,
      workspaceId: session.workspaceId,
      cwd: session.cwd,
    }),
  ).catch(() => {});
  trackClosingSession(session.sessionId, stopPromise);
  await stopPromise;

  if (activePiSessions.get(tabId) === session) {
    activePiSessions.delete(tabId);
  }
  runtimeSessionRecords.delete(tabId);
  agentChatStore.getState().removeSession(tabId);
  clearAgentChatSessionStatsSequence(session.sessionId);
}
