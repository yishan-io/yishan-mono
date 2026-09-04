import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { tabStore } from "@renderer/domains/workbench";
import { delay } from "@shared/async/delay";
import type { AgentRuntime } from "../daemon/daemonAgentTypes";
import { buildAgentRuntimeSessionKey } from "./agentSessionIdentity";

const CLOSING_SESSION_WAIT_TIMEOUT_MS = 6_000;

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void };

/** Holds all local bookkeeping for one agent runtime session. */
export type AgentRuntimeSessionRecord = {
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
};

const activeSessions = new Map<string, AgentRuntimeSessionRecord>();
const runtimeSessionRecords = new Map<string, AgentRuntimeSessionRecord>();
const closingSessions = new Map<string, Promise<void>>();

/** Returns the open tab with this runtime-tagged session identity. */
export function findTabWithSession(sessionId: string, runtime: AgentRuntime = "pi"): string | undefined {
  const openTabIds = new Set(tabStore.getState().tabs.map((tab) => tab.id));
  const activeTabId = findActiveAgentSessionTabId(runtime, sessionId, (tabId) => openTabIds.has(tabId));
  if (activeTabId) return activeTabId;
  return tabStore
    .getState()
    .tabs.find(
      (tab) => tab.kind === "agent-chat" && (tab.data.runtime ?? "pi") === runtime && tab.data.sessionId === sessionId,
    )?.id;
}

/** Creates a deferred promise used to coordinate session startup. */
export function createAgentSessionDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: (value) => resolve?.(value), reject: (reason) => reject?.(reason) };
}

/** Registers a record as both active and retained runtime state for a tab. */
export function registerAgentSessionRecord(tabId: string, sessionRecord: AgentRuntimeSessionRecord): void {
  runtimeSessionRecords.set(tabId, sessionRecord);
  activeSessions.set(tabId, sessionRecord);
}

/** Gets the active local record for a tab. */
export function getActiveAgentSessionRecord(tabId: string): AgentRuntimeSessionRecord | undefined {
  return activeSessions.get(tabId);
}

/** Gets the retained runtime record for a tab, including records whose active handle was cleared. */
export function getRuntimeAgentSessionRecord(tabId: string): AgentRuntimeSessionRecord | undefined {
  return runtimeSessionRecords.get(tabId);
}

/** Clears only a tab's active record, retaining its runtime record until close. */
export function clearActiveAgentSessionRecord(tabId: string): void {
  activeSessions.delete(tabId);
}

/** Clears a tab's active record only when it still matches the given record. */
export function clearActiveAgentSessionRecordIfMatches(tabId: string, sessionRecord: AgentRuntimeSessionRecord): void {
  if (activeSessions.get(tabId) === sessionRecord) activeSessions.delete(tabId);
}

/** Removes a tab's retained runtime record. */
export function removeRuntimeAgentSessionRecord(tabId: string): void {
  runtimeSessionRecords.delete(tabId);
}

/** Removes both local records for a tab. */
export function removeAllAgentSessionRecords(tabId: string): void {
  activeSessions.delete(tabId);
  runtimeSessionRecords.delete(tabId);
}

/** Finds an active tab for a runtime-tagged session identity. */
export function findActiveAgentSessionTabId(
  runtime: AgentRuntime,
  sessionId: string,
  isEligibleTab: (tabId: string) => boolean,
): string | undefined {
  for (const [tabId, sessionRecord] of activeSessions) {
    if (sessionRecord.runtime === runtime && sessionRecord.sessionId === sessionId && isEligibleTab(tabId))
      return tabId;
  }
  return undefined;
}

/** Waits for a tracked close of this runtime-scoped session to settle. */
export async function waitForClosingAgentSession(runtime: AgentRuntime, sessionId: string): Promise<void> {
  await closingSessions.get(buildAgentRuntimeSessionKey(runtime, sessionId))?.catch(() => undefined);
}

/** Tracks a close operation under its runtime-scoped session identity. */
export function trackClosingAgentSession(
  runtime: AgentRuntime,
  sessionId: string,
  stopPromise: Promise<unknown>,
): void {
  const sessionKey = buildAgentRuntimeSessionKey(runtime, sessionId);
  const tracked = Promise.race([stopPromise.then(() => undefined), delay(CLOSING_SESSION_WAIT_TIMEOUT_MS)]).catch(
    () => undefined,
  );
  closingSessions.set(sessionKey, tracked);
  void tracked.finally(() => {
    if (closingSessions.get(sessionKey) === tracked) closingSessions.delete(sessionKey);
  });
}

/** Gets a matching retained runtime record or throws when it is absent. */
export function requireAgentRuntimeSessionRecord(tabId: string, sessionId: string): AgentRuntimeSessionRecord {
  const sessionRecord = runtimeSessionRecords.get(tabId);
  if (sessionRecord?.sessionId === sessionId) return sessionRecord;
  throw new Error(`No runtime session record for agent-chat tab ${tabId}`);
}
