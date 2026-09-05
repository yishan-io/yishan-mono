import { delay } from "@shared/async/delay";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { attachAgentSession, getAgentCapabilities, readAgentRuntimeHistory } from "../daemon/daemonAgentProcedures";
import type { AgentDSHAttachResult, AgentStartResult } from "../daemon/daemonAgentTypes";
import { agentChatStore } from "../state/agentChatStore";
import { registerAgentChatDSHEventRouter } from "../subscriptions/agentChatDSHEventRouter";
import type { DSHFrontendPayload } from "../subscriptions/dshTranscript";
import { DSHTranscriptController } from "../subscriptions/dshTranscriptController";
import type { AgentRuntimeSessionRecord } from "./agentSessionRegistry";
import type { IsActiveDshParent } from "./dshSubagentLifecycle";
import { confirmCancellation, refreshLineage } from "./dshSubagentLifecycle";

const DSH_RECOVERY_POLL_WINDOW_MS = 2_500;
const DSH_RECOVERY_RETRY_DELAY_MS = 100;
const DSH_RECOVERY_ATTEMPTS = Math.ceil(DSH_RECOVERY_POLL_WINDOW_MS / DSH_RECOVERY_RETRY_DELAY_MS) + 1;
const DSH_RUNTIME_UNAVAILABLE_CODE = "DSH_RUNTIME_UNAVAILABLE";

type DSHLifecycleState = {
  controller: DSHTranscriptController;
  lifecycleRevisionsByInstanceId: Map<string, number>;
  currentLifecycleInstanceId: string | null;
};

const dshStateByRecord = new WeakMap<AgentRuntimeSessionRecord, DSHLifecycleState>();

/** Creates the DSH durable transcript controller for a DSH runtime record. */
export function createDSHTranscriptController(
  record: AgentRuntimeSessionRecord,
  tabId: string,
  isAwaitingStartAttachSnapshot = false,
): void {
  const controller = new DSHTranscriptController(
    tabId,
    record.sessionId,
    agentChatStore.getState(),
    async () =>
      await loadDSHDurableHistory({ sessionId: record.sessionId, workspaceId: record.workspaceId, cwd: record.cwd }),
    () => {},
    async (cursor): Promise<AgentDSHAttachResult> => {
      const snapshot = await attachAgentSession({
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
    isAwaitingStartAttachSnapshot,
  );
  dshStateByRecord.set(record, {
    controller,
    lifecycleRevisionsByInstanceId: new Map(),
    currentLifecycleInstanceId: null,
  });
}

/** Registers DSH event routing and lifecycle lineage refresh for a DSH runtime record. */
export function registerDSHAgentSessionRouter(
  record: AgentRuntimeSessionRecord,
  tabId: string,
  isActiveDshParent: IsActiveDshParent,
): () => void {
  const state = requireDSHState(record);
  return registerAgentChatDSHEventRouter({
    tabId,
    sessionId: record.sessionId,
    onEvent: (payload) => state.controller.handle(payload),
    onLifecycleUpdate: (payload) => {
      if (!advanceDshLifecycleWatermark(state, payload)) return;
      recordDshDelegationLifecycle(tabId, payload);
      refreshLineageForLifecycle(record, state, tabId, payload, isActiveDshParent);
    },
    onMalformedPayload: () => state.controller.handleMalformedPayload(),
  });
}

/** Applies a DSH attach snapshot at the controller's current durable cursor. */
export async function attachDSHAgentSession(record: AgentRuntimeSessionRecord, tabId: string): Promise<void> {
  const result = await attachAgentSession({
    runtime: "dsh",
    sessionId: record.sessionId,
    tabId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
    afterSeq: requireDSHState(record).controller.getDurableThroughSeq(),
  });
  if (result.runtime !== "dsh" || !("events" in result)) throw new TypeError("invalid DSH attach response");
  requireDSHState(record).controller.applyAttachSnapshot(result);
}

/** Applies the one-shot DSH transcript seed returned by a successful session start. */
export function applyDSHStartSnapshot(record: AgentRuntimeSessionRecord, result: AgentStartResult): void {
  if (result.runtime !== "dsh") throw new TypeError("DSH start returned another runtime");
  requireDSHState(record).controller.applyAttachSnapshot(result.dshAttachSnapshot);
}

/** Retries a failed DSH durable transcript reload. */
export async function retryDSHAgentTranscript(record: AgentRuntimeSessionRecord): Promise<void> {
  await requireDSHState(record).controller.retry();
}

/** Hydrates a DSH transcript according to an explicit ownership mode. */
type DSHTranscriptHydrationInput = {
  tabId: string;
  sessionId: string;
  workspaceId: string;
  cwd: string;
} & (
  | { mode: "managed" }
  | {
      mode: "read-only";
      expectedParentSessionId: string;
    }
);

/** Hydrates a DSH transcript according to its session-ownership mode. */
export async function hydrateDSHTranscript(input: DSHTranscriptHydrationInput): Promise<void> {
  if (input.mode === "read-only" && !input.expectedParentSessionId.trim())
    throw new TypeError("DSH read-only transcript requires an expected parent session ID");

  const history = await readAgentRuntimeHistory({
    runtime: "dsh",
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
  });
  if (history.runtime !== "dsh") throw new TypeError("DSH transcript history returned another runtime");
  if (
    input.mode === "read-only" &&
    (history.dsh.session.origin !== "subagent" || history.dsh.session.parentSession !== input.expectedParentSessionId)
  )
    throw new TypeError("DSH read-only transcript is not the expected subagent child");

  const controller = new DSHTranscriptController(
    input.tabId,
    input.sessionId,
    agentChatStore.getState(),
    async () => history.dsh,
    () => {},
  );
  agentChatStore.getState().initSession(input.tabId, input.sessionId);
  controller.applyAttachSnapshot({
    runtime: "dsh",
    sessionId: input.sessionId,
    instanceId: history.dsh.instanceId,
    events: history.dsh.events,
    asOfSeq: history.dsh.asOfSeq,
    durableThroughSeq: history.dsh.durableThroughSeq,
    headSeq: history.dsh.asOfSeq,
  });
  agentChatStore.getState().setAvailableModels(input.tabId, []);
  agentChatStore.getState().markStateLoaded(input.tabId);
  agentChatStore.getState().setSessionState(input.tabId, "idle");
}

function recordDshDelegationLifecycle(tabId: string, payload: DSHFrontendPayload): void {
  const lifecycle = payload.update.lifecycle;
  if (!lifecycle || lifecycle.event !== "finished") return;
  agentChatStore.getState().setDshDelegationLifecycle(tabId, {
    childSessionId: lifecycle.childSessionId,
    state:
      lifecycle.stopReason === "completed" ? "completed" : lifecycle.stopReason === "aborted" ? "aborted" : "error",
  });
}

function refreshLineageForLifecycle(
  record: AgentRuntimeSessionRecord,
  state: DSHLifecycleState,
  tabId: string,
  payload: DSHFrontendPayload,
  isActiveDshParent: IsActiveDshParent,
): void {
  const lifecycle = payload.update.lifecycle;
  if (
    record.sessionView !== "full" ||
    payload.sessionId !== record.sessionId ||
    (lifecycle?.parentSessionId ?? payload.update.lifecycleResync?.parentSessionId) !== record.sessionId ||
    !isActiveDshParent(tabId, record.sessionId)
  )
    return;

  // fire-and-forget: lineage is supplementary and must not delay DSH event handling.
  void refreshLineage({
    tabId,
    workspaceId: record.workspaceId,
    cwd: record.cwd,
    rootSessionId: record.sessionId,
    isActiveDshParent,
  })
    .then((lineage) => {
      if (
        !lifecycle ||
        !isCurrentDshLifecycleWatermark(state, lifecycle) ||
        !isActiveDshParent(tabId, record.sessionId)
      )
        return;
      confirmCancellation({
        tabId,
        sessionId: record.sessionId,
        rowKey: lifecycle.childSessionId,
        childSessionId: lifecycle.childSessionId,
        lifecycle,
        lineage,
        isActiveDshParent,
      });
    })
    .catch((error: unknown) => console.warn("Failed to refresh DSH subagent lineage", getErrorMessage(error)));
}

function advanceDshLifecycleWatermark(state: DSHLifecycleState, payload: DSHFrontendPayload): boolean {
  const lifecycleUpdate = payload.update.lifecycle ?? payload.update.lifecycleResync;
  if (!lifecycleUpdate) return false;
  const isNewInstanceId = state.currentLifecycleInstanceId !== lifecycleUpdate.instanceId;
  if (isNewInstanceId && state.lifecycleRevisionsByInstanceId.has(lifecycleUpdate.instanceId)) return false;
  const latestRevision = state.lifecycleRevisionsByInstanceId.get(lifecycleUpdate.instanceId);
  if (latestRevision !== undefined && lifecycleUpdate.revision <= latestRevision) return false;
  state.lifecycleRevisionsByInstanceId.set(lifecycleUpdate.instanceId, lifecycleUpdate.revision);
  if (isNewInstanceId) state.currentLifecycleInstanceId = lifecycleUpdate.instanceId;
  return true;
}

function isCurrentDshLifecycleWatermark(
  state: DSHLifecycleState,
  lifecycle: NonNullable<DSHFrontendPayload["update"]["lifecycle"]>,
): boolean {
  return (
    state.currentLifecycleInstanceId === lifecycle.instanceId &&
    state.lifecycleRevisionsByInstanceId.get(lifecycle.instanceId) === lifecycle.revision
  );
}

async function loadDSHDurableHistory(input: { sessionId: string; workspaceId: string; cwd: string }) {
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

function isDSHRuntimeUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const { data } = error as { data: unknown };
  return typeof data === "object" && data !== null && "code" in data && data.code === DSH_RUNTIME_UNAVAILABLE_CODE;
}

function requireDSHState(record: AgentRuntimeSessionRecord): DSHLifecycleState {
  const state = dshStateByRecord.get(record);
  if (!state) throw new Error("DSH session adapter state is required");
  return state;
}
