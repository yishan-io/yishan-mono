import { bindAgentChatTabSession, tabStore } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { generateId } from "@shared/ids/generateId";
import {
  abortAgentSession as abortAgentSessionProcedure,
  attachAgentSession as attachAgentSessionProcedure,
  disposeAgentSession as disposeAgentSessionProcedure,
  promptAgentSession as promptAgentSessionProcedure,
  startAgentSession as startAgentSessionProcedure,
} from "../daemon/daemonAgentProcedures";
import type { AgentRuntime } from "../daemon/daemonAgentTypes";
import { agentChatStore } from "../state/agentChatStore";
import { disposeAgentChatStreamBuffer, flushAgentChatStreamBuffer } from "./agentChatStreamBuffer";
import {
  attachDSHAgentSession,
  createDSHTranscriptController,
  registerDSHAgentSessionRouter,
  retryDSHAgentTranscript,
} from "./dshAgentSessionAdapter";
import {
  clearPiAgentSessionStats,
  ensurePiAgentSessionRouterReady,
  fetchPiAgentMessagesCompatibility,
  fetchPiAgentModelsCompatibility,
  fetchPiAgentStateCompatibility,
  isPiSessionAlreadyRunningError,
  recoverPiAgentSessionAfterReconnect,
  registerPiAgentSessionRouter,
} from "./piAgentSessionAdapter";

import {
  clearActiveAgentSessionRecord,
  clearActiveAgentSessionRecordIfMatches,
  createAgentSessionDeferred,
  getActiveAgentSessionRecord,
  getRuntimeAgentSessionRecord,
  registerAgentSessionRecord,
  removeRuntimeAgentSessionRecord,
  requireAgentRuntimeSessionRecord,
  trackClosingAgentSession,
  waitForClosingAgentSession,
} from "./agentSessionRegistry";
import type { AgentRuntimeSessionRecord } from "./agentSessionRegistry";

export { fetchPiAgentMessagesCompatibility, fetchPiAgentModelsCompatibility, fetchPiAgentStateCompatibility };

/** Returns whether a tab and chat session still own the expected DSH parent. */
export function isActiveDshParent(tabId: string, sessionId: string): boolean {
  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
  const session = agentChatStore.getState().sessionsByTabId[tabId];
  return (
    tab?.kind === "agent-chat" &&
    tab.data.runtime === "dsh" &&
    tab.data.sessionId === sessionId &&
    session?.sessionId === sessionId
  );
}

/** Ensures a Pi session exists, preserving the legacy public API. */
export async function ensurePiSession(opts: EnsureAgentSessionOptions): Promise<EnsureAgentSessionResult> {
  return await ensureAgentSession({ ...opts, runtime: "pi" });
}

type EnsureAgentSessionOptions = {
  runtime?: AgentRuntime;
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView?: AgentChatSessionView;
  paneId?: string;
  /** For DSH sessions: the model id to use for this session (overrides daemon default). */
  dshModelId?: string;
  /** For DSH sessions: the provider route paired with dshModelId. */
  dshProviderId?: string;
};
type EnsureAgentSessionResult = { sessionId: string; attached: boolean; runtime: AgentRuntime };

/** Ensures a runtime-neutral session exists without inferring runtime from an id. */
export async function ensureAgentSession(opts: EnsureAgentSessionOptions): Promise<EnsureAgentSessionResult> {
  const runtime = opts.runtime ?? "pi";
  const existing = getActiveAgentSessionRecord(opts.tabId);
  if (existing) {
    if (existing.runtime !== runtime) {
      throw new Error(`Agent-chat tab ${opts.tabId} is already bound to ${existing.runtime}`);
    }
    await existing.startPromise?.catch(() => undefined);
    if (getActiveAgentSessionRecord(opts.tabId) !== existing) return await ensureAgentSession(opts);
    return { sessionId: existing.sessionId, attached: true, runtime };
  }

  const sessionId = opts.sessionId?.trim() || generateId();
  const chatSession = agentChatStore.getState().sessionsByTabId[opts.tabId];
  if (chatSession && chatSession.state !== "error" && !opts.sessionId?.trim()) {
    return await adoptExistingChatSession(opts, runtime, chatSession.sessionId);
  }

  agentChatStore.getState().initSession(opts.tabId, sessionId);
  const record: AgentRuntimeSessionRecord = {
    runtime,
    sessionId,
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    ownsSessionOnClose: opts.sessionView !== "subagent-detail",
    sessionView: opts.sessionView ?? "full",
    unsubscribe: null,
    state: "starting",
    closeRequested: false,
    startPromise: null,
  };
  if (runtime === "dsh") createDSHTranscriptController(record, opts.tabId);
  record.unsubscribe = registerRuntimeRouter(runtime, opts.tabId, sessionId, record);
  const deferredStart = createAgentSessionDeferred<void>();
  record.startPromise = deferredStart.promise;
  // This promise can reject when startup fails without a concurrent stop.
  void deferredStart.promise.catch(() => undefined);
  registerAgentSessionRecord(opts.tabId, record);
  if (runtime === "pi") await ensurePiAgentSessionRouterReady();
  await waitForClosingAgentSession(runtime, sessionId);

  let didAttach = false;
  const startPromise = startRuntimeSession(record, opts)
    .catch(async (error) => {
      if (!opts.sessionId?.trim() || !isPiSessionAlreadyRunningError(error)) throw error;
      didAttach = true;
      await attachRuntimeSession(record, opts.tabId);
    })
    .then(async () => {
      bindAgentChatTabSession({ tabId: opts.tabId, sessionId, runtime });
      if (record.closeRequested) {
        await releaseOrDisposeSession(opts.tabId, record);
      } else {
        record.state = "running";
      }
    })
    .catch((error) => {
      record.unsubscribe?.();
      clearActiveAgentSessionRecordIfMatches(opts.tabId, record);
      removeRuntimeAgentSessionRecord(opts.tabId);
      throw error;
    });
  startPromise.then(
    () => {
      record.startPromise = null;
      deferredStart.resolve();
    },
    (error) => deferredStart.reject(error),
  );
  await startPromise;
  return { sessionId, attached: didAttach, runtime };
}
export { findTabWithSession } from "./agentSessionRegistry";

/** Drops a local Pi handle. */
export const clearPiSessionHandle = clearAgentSessionHandle;
/** Drops a local runtime handle. */
export function clearAgentSessionHandle(tabId: string): void {
  const record = getActiveAgentSessionRecord(tabId);
  record?.unsubscribe?.();
  clearActiveAgentSessionRecord(tabId);
}

/** Reattaches the tab's runtime session and reports whether its local record existed. */
export async function reattachAgentSession(tabId: string): Promise<boolean> {
  const record = getActiveAgentSessionRecord(tabId);
  if (!record) return false;
  if (record.state === "closing") return true;
  await attachRuntimeSession(record, tabId);
  if (record.runtime === "pi") agentChatStore.getState().setSessionState(tabId, "starting");
  return true;
}
/** Retries a failed DSH durable transcript reload without changing runtimes. */
export async function retryDSHTranscript(tabId: string): Promise<void> {
  const record = getActiveAgentSessionRecord(tabId);
  if (record?.runtime !== "dsh") return;
  await retryDSHAgentTranscript(record);
}
/** Reattaches a live Pi session through the legacy API. */
export async function reattachPiSession(tabId: string): Promise<void> {
  await reattachAgentSession(tabId);
}

/** Sends one prompt to its recorded runtime. */
export async function promptAgentSession(opts: {
  tabId: string;
  sessionId: string;
  message: string;
  streamingBehavior?: string;
}): Promise<void> {
  const record = requireAgentRuntimeSessionRecord(opts.tabId, opts.sessionId);
  await promptAgentSessionProcedure({
    runtime: record.runtime,
    sessionId: opts.sessionId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
    message: opts.message,
    ...(record.runtime === "pi" && opts.streamingBehavior ? { streamingBehavior: opts.streamingBehavior } : {}),
  });
}
/** Aborts one runtime-neutral session. */
export async function abortAgentSession(tabId: string, sessionId: string): Promise<void> {
  const record = requireAgentRuntimeSessionRecord(tabId, sessionId);
  await abortAgentSessionProcedure({
    runtime: record.runtime,
    sessionId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
  });
}
/** Disposes one runtime-neutral session. */
export async function stopAgentSession(tabId: string): Promise<void> {
  flushAgentChatStreamBuffer(tabId);
  disposeAgentChatStreamBuffer(tabId);
  const record = getActiveAgentSessionRecord(tabId) ?? getRuntimeAgentSessionRecord(tabId);
  if (!record) {
    agentChatStore.getState().removeSession(tabId);
    return;
  }
  record.closeRequested = true;
  record.unsubscribe?.();
  record.unsubscribe = null;
  await record.startPromise?.catch(() => undefined);
  await releaseOrDisposeSession(tabId, record);
}
/** Disposes a Pi session through the legacy public API. */
export const stopPiSession = stopAgentSession;

/** Recovers a session without changing its chosen runtime after failures. */
export async function recoverAgentSessionAfterReconnect(
  opts: EnsureAgentSessionOptions & { sessionId: string },
): Promise<void> {
  const runtime = opts.runtime ?? "pi";
  if (runtime === "pi") {
    await recoverPiAgentSessionAfterReconnect({
      tabId: opts.tabId,
      sessionId: opts.sessionId,
      reattach: async () => {
        await reattachAgentSession(opts.tabId);
      },
      clearLocalHandle: () => clearAgentSessionHandle(opts.tabId),
      ensure: async () => {
        await ensureAgentSession({ ...opts, runtime });
      },
    });
    return;
  }

  try {
    const hasLocalRecord = await reattachAgentSession(opts.tabId);
    if (!hasLocalRecord) await ensureAgentSession({ ...opts, runtime });
  } catch (error) {
    agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(error));
  }
}

function registerRuntimeRouter(
  runtime: AgentRuntime,
  tabId: string,
  sessionId: string,
  record: AgentRuntimeSessionRecord,
): () => void {
  if (runtime === "pi") return registerPiAgentSessionRouter(tabId, sessionId);
  return registerDSHAgentSessionRouter(record, tabId, isActiveDshParent);
}

async function adoptExistingChatSession(
  opts: EnsureAgentSessionOptions,
  runtime: AgentRuntime,
  sessionId: string,
): Promise<EnsureAgentSessionResult> {
  if (runtime === "pi") await ensurePiAgentSessionRouterReady();
  const record: AgentRuntimeSessionRecord = {
    runtime,
    sessionId,
    workspaceId: opts.workspaceId,
    cwd: opts.cwd,
    ownsSessionOnClose: true,
    sessionView: opts.sessionView ?? "full",
    unsubscribe: null,
    state: "running",
    closeRequested: false,
    startPromise: null,
  };
  if (runtime === "dsh") createDSHTranscriptController(record, opts.tabId);
  record.unsubscribe = registerRuntimeRouter(runtime, opts.tabId, sessionId, record);
  registerAgentSessionRecord(opts.tabId, record);
  return { sessionId, attached: true, runtime };
}
async function startRuntimeSession(record: AgentRuntimeSessionRecord, opts: EnsureAgentSessionOptions): Promise<void> {
  const shouldResumeDSH = record.runtime === "dsh" && Boolean(opts.sessionId?.trim());
  // Use the model passed through opts (read before initSession cleared the store).
  const dshModelId = record.runtime === "dsh" && !shouldResumeDSH ? opts.dshModelId : undefined;
  const dshProviderId = record.runtime === "dsh" && !shouldResumeDSH ? opts.dshProviderId : undefined;
  await startAgentSessionProcedure({
    runtime: record.runtime,
    sessionId: record.sessionId,
    tabId: opts.tabId,
    paneId: resolveAgentChatPaneId(opts.tabId, opts.paneId),
    workspaceId: record.workspaceId,
    cwd: record.cwd,
    ...(shouldResumeDSH ? { resume: true } : {}),
    ...(dshModelId ? { modelId: dshModelId } : {}),
    ...(dshProviderId ? { provider: dshProviderId } : {}),
  });
}
async function attachRuntimeSession(record: AgentRuntimeSessionRecord, tabId: string): Promise<void> {
  if (record.runtime === "dsh") {
    await attachDSHAgentSession(record, tabId);
    return;
  }
  await attachAgentSessionProcedure({
    runtime: record.runtime,
    sessionId: record.sessionId,
    tabId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
  });
}
async function releaseOrDisposeSession(tabId: string, record: AgentRuntimeSessionRecord): Promise<void> {
  if (record.state === "closing") return;
  record.state = "closing";
  if (record.ownsSessionOnClose) {
    const disposePromise = Promise.resolve(
      disposeAgentSessionProcedure({
        runtime: record.runtime,
        sessionId: record.sessionId,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
      }),
    ).catch(() => {});
    trackClosingAgentSession(record.runtime, record.sessionId, disposePromise);
    await disposePromise;
  }
  clearActiveAgentSessionRecordIfMatches(tabId, record);
  removeRuntimeAgentSessionRecord(tabId);
  agentChatStore.getState().removeSession(tabId);
  if (record.runtime === "pi") clearPiAgentSessionStats(record.sessionId);
}
function resolveAgentChatPaneId(tabId: string, paneId: string | undefined): string {
  return paneId?.trim() || `pane-${tabId}`;
}
