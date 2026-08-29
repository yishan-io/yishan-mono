import { tabStore } from "@renderer/domains/workbench";
import { bindAgentChatTabSession } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { delay } from "@shared/async/delay";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { generateId } from "@shared/ids/generateId";
import {
  abortAgentSession as abortAgentSessionProcedure,
  attachAgentSession as attachAgentSessionProcedure,
  disposeAgentSession as disposeAgentSessionProcedure,
  getAgentCapabilities,
  promptAgentSession as promptAgentSessionProcedure,
  readAgentRuntimeHistory,
  startAgentSession as startAgentSessionProcedure,
} from "../daemon/daemonAgentProcedures";
import type { AgentDSHAttachResult, AgentRuntime } from "../daemon/daemonAgentTypes";
import { agentChatStore } from "../state/agentChatStore";
import { registerAgentChatDSHEventRouter } from "../subscriptions/agentChatDSHEventRouter";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import { handleAgentPiEvent } from "../subscriptions/agentChatPiEventHandler";
import { clearAgentChatSessionStatsSequence } from "../subscriptions/agentChatPiEventShared";
import type { DSHFrontendPayload } from "../subscriptions/dshTranscript";
import { DSHTranscriptController } from "../subscriptions/dshTranscriptController";
import { disposeAgentChatStreamBuffer, flushAgentChatStreamBuffer } from "./agentChatStreamBuffer";
import { buildAgentRuntimeSessionKey } from "./agentSessionIdentity";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void };
type AgentRuntimeSessionRecord = {
  runtime: AgentRuntime;
  sessionId: string;
  workspaceId: string;
  cwd: string;
  ownsSessionOnClose: boolean;
  sessionView: AgentChatSessionView;
  unsubscribe: (() => void) | null;
  state: "starting" | "running" | "closing";
  closeRequested: boolean;
  startPromise: Promise<void> | null;
  dshTranscriptController: DSHTranscriptController | null;
  lifecycleRevisionsByInstanceId: Map<string, number>;
  currentLifecycleInstanceId: string | null;
};

const activeSessions = new Map<string, AgentRuntimeSessionRecord>();
const runtimeSessionRecords = new Map<string, AgentRuntimeSessionRecord>();
const closingSessions = new Map<string, Promise<void>>();
const PI_SESSION_EXISTS_RPC_CODE = -32003;
const CLOSING_SESSION_WAIT_TIMEOUT_MS = 6_000;

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
  const existing = activeSessions.get(opts.tabId);
  if (existing) {
    if (existing.runtime !== runtime) {
      throw new Error(`Agent-chat tab ${opts.tabId} is already bound to ${existing.runtime}`);
    }
    await existing.startPromise?.catch(() => undefined);
    if (activeSessions.get(opts.tabId) !== existing) return await ensureAgentSession(opts);
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
    dshTranscriptController: null,
    lifecycleRevisionsByInstanceId: new Map(),
    currentLifecycleInstanceId: null,
  };
  record.dshTranscriptController = createDSHTranscriptController(record, opts.tabId);
  record.unsubscribe = registerRuntimeRouter(runtime, opts.tabId, sessionId, record.dshTranscriptController, record);
  const deferredStart = createDeferred<void>();
  record.startPromise = deferredStart.promise;
  // This promise can reject when startup fails without a concurrent stop.
  void deferredStart.promise.catch(() => undefined);
  runtimeSessionRecords.set(opts.tabId, record);
  activeSessions.set(opts.tabId, record);
  if (runtime === "pi") await ensureAgentChatEventRouterReady();
  await closingSessions.get(buildAgentRuntimeSessionKey(runtime, sessionId))?.catch(() => undefined);

  let didAttach = false;
  const startPromise = startRuntimeSession(record, opts)
    .catch(async (error) => {
      if (!opts.sessionId?.trim() || !isSessionAlreadyRunningError(error)) throw error;
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
      if (activeSessions.get(opts.tabId) === record) activeSessions.delete(opts.tabId);
      runtimeSessionRecords.delete(opts.tabId);
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

/** Returns the open tab with this runtime-tagged session identity. */
export function findTabWithSession(sessionId: string, runtime: AgentRuntime = "pi"): string | undefined {
  const openTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));
  for (const [tabId, record] of activeSessions) {
    if (record.runtime === runtime && record.sessionId === sessionId && openTabIds.has(tabId)) return tabId;
  }
  return tabStore
    .getState()
    .tabs.find(
      (tab) => tab.kind === "agent-chat" && (tab.data.runtime ?? "pi") === runtime && tab.data.sessionId === sessionId,
    )?.id;
}

/** Drops a local Pi handle. */
export function clearPiSessionHandle(tabId: string): void {
  clearAgentSessionHandle(tabId);
}
/** Drops a local runtime handle. */
export function clearAgentSessionHandle(tabId: string): void {
  const record = activeSessions.get(tabId);
  record?.unsubscribe?.();
  activeSessions.delete(tabId);
}

/** Reattaches the tab's runtime session and reports whether its local record existed. */
export async function reattachAgentSession(tabId: string): Promise<boolean> {
  const record = activeSessions.get(tabId);
  if (!record) return false;
  if (record.state === "closing") return true;
  await attachRuntimeSession(record, tabId);
  if (record.runtime === "pi") agentChatStore.getState().setSessionState(tabId, "starting");
  return true;
}
/** Retries a failed DSH durable transcript reload without changing runtimes. */
export async function retryDSHTranscript(tabId: string): Promise<void> {
  const record = activeSessions.get(tabId);
  if (record?.runtime !== "dsh") return;
  await record.dshTranscriptController?.retry();
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
  const record = requireRuntimeSessionRecord(opts.tabId, opts.sessionId);
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
  const record = requireRuntimeSessionRecord(tabId, sessionId);
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
  const record = activeSessions.get(tabId) ?? runtimeSessionRecords.get(tabId);
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
export async function stopPiSession(tabId: string): Promise<void> {
  await stopAgentSession(tabId);
}

/** Pi-only state hydration control. */
export async function fetchPiAgentModelsCompatibility(opts: { tabId: string; sessionId: string }): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_available_models" });
}
/** Pi-only state hydration control. */
export async function fetchPiAgentStateCompatibility(opts: { tabId: string; sessionId: string }): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_state" });
}
/** Pi-only state hydration control. */
export async function fetchPiAgentMessagesCompatibility(opts: { tabId: string; sessionId: string }): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_messages" });
}

async function sendPiControl(sessionId: string, command: unknown): Promise<void> {
  const { sendPiCompatibilityCommand } = await import("../daemon/daemonAgentProcedures");
  await sendPiCompatibilityCommand({ sessionId, command });
}

/** Recovers a session without changing its chosen runtime after failures. */
export async function recoverAgentSessionAfterReconnect(
  opts: EnsureAgentSessionOptions & { sessionId: string },
): Promise<void> {
  const runtime = opts.runtime ?? "pi";
  try {
    const hasLocalRecord = await reattachAgentSession(opts.tabId);
    if (!hasLocalRecord && runtime === "dsh") {
      await ensureAgentSession({ ...opts, runtime });
      return;
    }
    if (runtime === "pi") await hydratePiSession(opts.tabId, opts.sessionId);
  } catch (error) {
    if (runtime === "dsh") {
      agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(error));
      return;
    }
    clearAgentSessionHandle(opts.tabId);
    try {
      await ensureAgentSession({ ...opts, runtime });
      await hydratePiSession(opts.tabId, opts.sessionId);
    } catch (recoveryError) {
      agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(recoveryError));
    }
  }
}

async function hydratePiSession(tabId: string, sessionId: string): Promise<void> {
  const { refreshAgentSessionStats } = await import("../subscriptions/agentChatPiEventShared");
  agentChatStore.getState().setSubagentSessionEndedAt(tabId, null);
  await fetchPiAgentStateCompatibility({ tabId, sessionId });
  await fetchPiAgentMessagesCompatibility({ tabId, sessionId });
  await fetchPiAgentModelsCompatibility({ tabId, sessionId });
  await refreshAgentSessionStats(sessionId);
}

function registerPiRouter(tabId: string, sessionId: string): () => void {
  return registerAgentChatEventRouter({ tabId, sessionId, onEvent: (payload) => handleAgentPiEvent(payload) });
}
function registerRuntimeRouter(
  runtime: AgentRuntime,
  tabId: string,
  sessionId: string,
  controller: DSHTranscriptController | null,
  record: AgentRuntimeSessionRecord,
): () => void {
  if (runtime === "pi") return registerPiRouter(tabId, sessionId);
  if (!controller) throw new Error("DSH transcript controller is required");
  return registerAgentChatDSHEventRouter({
    tabId,
    sessionId,
    onEvent: (payload) => controller.handle(payload),
    onLifecycleUpdate: (payload) => {
      if (!advanceDshLifecycleWatermark(record, payload)) return;
      refreshDshSubagentLineageForLifecycle(record, tabId, payload);
    },
    onMalformedPayload: () => controller.handleMalformedPayload(),
  });
}
function refreshDshSubagentLineageForLifecycle(
  record: AgentRuntimeSessionRecord,
  tabId: string,
  payload: DSHFrontendPayload,
): void {
  if (
    record.sessionView !== "full" ||
    payload.sessionId !== record.sessionId ||
    (payload.update.lifecycle?.parentSessionId ?? payload.update.lifecycleResync?.parentSessionId) !==
      record.sessionId ||
    !isCurrentDshRuntimeParent(record, tabId)
  ) {
    return;
  }
  // fire-and-forget: lineage is supplementary and must not delay DSH event handling.
  void import("../commands/agentChatCommands")
    .then(async ({ refreshDshSubagentLineage }) => {
      const lineage = await refreshDshSubagentLineage({
        tabId,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
        rootSessionId: record.sessionId,
      });
      if (
        !payload.update.lifecycle ||
        !isCurrentDshLifecycleWatermark(record, payload) ||
        !isCurrentDshRuntimeParent(record, tabId)
      ) {
        return;
      }
      const { confirmDshSubagentCancellationFromLifecycle } = await import(
        "../commands/agentChatDshSubagentCancellation"
      );
      confirmDshSubagentCancellationFromLifecycle({
        tabId,
        sessionId: record.sessionId,
        rowKey: payload.update.lifecycle.childSessionId,
        childSessionId: payload.update.lifecycle.childSessionId,
        lifecycle: payload.update.lifecycle,
        lineage,
      });
    })
    .catch((error: unknown) => console.warn("Failed to load DSH subagent lineage refresh", getErrorMessage(error)));
}

/** Advances the current lifecycle instance ID only for a newer lifecycle or resync revision. */
function advanceDshLifecycleWatermark(record: AgentRuntimeSessionRecord, payload: DSHFrontendPayload): boolean {
  const lifecycleUpdate = payload.update.lifecycle ?? payload.update.lifecycleResync;
  if (!lifecycleUpdate) return false;

  const isNewInstanceId = record.currentLifecycleInstanceId !== lifecycleUpdate.instanceId;
  if (isNewInstanceId && record.lifecycleRevisionsByInstanceId.has(lifecycleUpdate.instanceId)) return false;

  const latestRevision = record.lifecycleRevisionsByInstanceId.get(lifecycleUpdate.instanceId);
  if (latestRevision !== undefined && lifecycleUpdate.revision <= latestRevision) return false;

  record.lifecycleRevisionsByInstanceId.set(lifecycleUpdate.instanceId, lifecycleUpdate.revision);
  if (isNewInstanceId) record.currentLifecycleInstanceId = lifecycleUpdate.instanceId;
  return true;
}

/** Returns whether an async lifecycle refresh still represents the active lifecycle revision. */
function isCurrentDshLifecycleWatermark(record: AgentRuntimeSessionRecord, payload: DSHFrontendPayload): boolean {
  const lifecycle = payload.update.lifecycle;
  return (
    lifecycle !== undefined &&
    record.currentLifecycleInstanceId === lifecycle.instanceId &&
    record.lifecycleRevisionsByInstanceId.get(lifecycle.instanceId) === lifecycle.revision
  );
}

function isCurrentDshRuntimeParent(record: AgentRuntimeSessionRecord, tabId: string): boolean {
  const tab = tabStore.getState().tabs.find((candidate) => candidate.id === tabId);
  const session = agentChatStore.getState().sessionsByTabId[tabId];
  return (
    tab?.kind === "agent-chat" &&
    tab.data.runtime === "dsh" &&
    tab.data.sessionId === record.sessionId &&
    session?.sessionId === record.sessionId
  );
}

function createDSHTranscriptController(
  record: AgentRuntimeSessionRecord,
  tabId: string,
): DSHTranscriptController | null {
  if (record.runtime !== "dsh") return null;
  return new DSHTranscriptController(
    tabId,
    record.sessionId,
    agentChatStore.getState(),
    async () =>
      await loadDSHDurableHistory({
        sessionId: record.sessionId,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
      }),
    () => {},
    async (cursor): Promise<AgentDSHAttachResult> => {
      const snapshot = await attachAgentSessionProcedure({
        runtime: "dsh",
        sessionId: record.sessionId,
        tabId,
        workspaceId: record.workspaceId,
        cwd: record.cwd,
        afterSeq: cursor.durableThroughSeq,
      });
      if (!("events" in snapshot)) throw new TypeError("invalid DSH recovery attach response");
      return snapshot;
    },
  );
}
// DSH's supervisor defaults to a one-second restart backoff. Keep polling long
// enough to observe that restart while keeping transcript recovery bounded.
const DSH_RECOVERY_POLL_WINDOW_MS = 2_500;
const DSH_RECOVERY_RETRY_DELAY_MS = 100;
const DSH_RECOVERY_ATTEMPTS = Math.ceil(DSH_RECOVERY_POLL_WINDOW_MS / DSH_RECOVERY_RETRY_DELAY_MS) + 1;

async function loadDSHDurableHistory(input: {
  sessionId: string;
  workspaceId: string;
  cwd: string;
}) {
  let lastUnavailableError: unknown;
  for (let attempt = 0; attempt < DSH_RECOVERY_ATTEMPTS; attempt++) {
    try {
      const history = await readAgentRuntimeHistory({ runtime: "dsh", ...input });
      if (history.runtime !== "dsh") throw new TypeError("DSH history loader returned another runtime");
      return history.dsh;
    } catch (error) {
      if (!isDSHRuntimeUnavailable(error) || attempt === DSH_RECOVERY_ATTEMPTS - 1) throw error;
      lastUnavailableError = error;
    }
    const capabilities = await getAgentCapabilities();
    if (!capabilities.dsh.ready) await delay(DSH_RECOVERY_RETRY_DELAY_MS);
  }
  throw lastUnavailableError;
}

const DSH_RUNTIME_UNAVAILABLE_CODE = "DSH_RUNTIME_UNAVAILABLE";

function isDSHRuntimeUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const { data } = error as { data: unknown };
  if (typeof data !== "object" || data === null || !("code" in data)) return false;
  return data.code === DSH_RUNTIME_UNAVAILABLE_CODE;
}

async function adoptExistingChatSession(
  opts: EnsureAgentSessionOptions,
  runtime: AgentRuntime,
  sessionId: string,
): Promise<EnsureAgentSessionResult> {
  if (runtime === "pi") await ensureAgentChatEventRouterReady();
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
    dshTranscriptController: null,
    lifecycleRevisionsByInstanceId: new Map(),
    currentLifecycleInstanceId: null,
  };
  record.dshTranscriptController = createDSHTranscriptController(record, opts.tabId);
  record.unsubscribe = registerRuntimeRouter(runtime, opts.tabId, sessionId, record.dshTranscriptController, record);
  runtimeSessionRecords.set(opts.tabId, record);
  activeSessions.set(opts.tabId, record);
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
  const result = await attachAgentSessionProcedure({
    runtime: record.runtime,
    sessionId: record.sessionId,
    tabId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
    ...(record.runtime === "dsh" ? { afterSeq: record.dshTranscriptController?.getDurableThroughSeq() ?? -1 } : {}),
  });
  if (record.runtime === "dsh") {
    if (result.runtime !== "dsh" || !("events" in result) || !record.dshTranscriptController) {
      throw new TypeError("invalid DSH attach response");
    }
    record.dshTranscriptController.applyAttachSnapshot(result);
  }
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
    trackClosingSession(record.runtime, record.sessionId, disposePromise);
    await disposePromise;
  }
  if (activeSessions.get(tabId) === record) activeSessions.delete(tabId);
  runtimeSessionRecords.delete(tabId);
  agentChatStore.getState().removeSession(tabId);
  if (record.runtime === "pi") clearAgentChatSessionStatsSequence(record.sessionId);
}
function requireRuntimeSessionRecord(tabId: string, sessionId: string): AgentRuntimeSessionRecord {
  const record = runtimeSessionRecords.get(tabId);
  if (record?.sessionId === sessionId) return record;
  throw new Error(`No runtime session record for agent-chat tab ${tabId}`);
}
function isSessionAlreadyRunningError(error: unknown): boolean {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === PI_SESSION_EXISTS_RPC_CODE) ||
    getErrorMessage(error).includes("agent session already exists")
  );
}
function resolveAgentChatPaneId(tabId: string, paneId: string | undefined): string {
  return paneId?.trim() || `pane-${tabId}`;
}
function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: (value) => resolve?.(value), reject: (reason) => reject?.(reason) };
}
function trackClosingSession(runtime: AgentRuntime, sessionId: string, stopPromise: Promise<unknown>): void {
  const sessionKey = buildAgentRuntimeSessionKey(runtime, sessionId);
  const tracked = Promise.race([stopPromise.then(() => undefined), delay(CLOSING_SESSION_WAIT_TIMEOUT_MS)]).catch(
    () => undefined,
  );
  closingSessions.set(sessionKey, tracked);
  void tracked.finally(() => {
    if (closingSessions.get(sessionKey) === tracked) closingSessions.delete(sessionKey);
  });
}
