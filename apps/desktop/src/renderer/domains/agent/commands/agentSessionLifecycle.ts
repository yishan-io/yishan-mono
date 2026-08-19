/**
 * Agent session lifecycle — the public lifecycle-status surface for the Agent
 * feature (Phase 12, desktop5.md). Owns the shared `lifecycleBySessionKey` map
 * and the workspace-level agent status derivation. The Notification handler
 * (observer-status recording from `notification.event`), the Terminal handler
 * (`clearTerminalAgentStatus` on tab close), and the Workbench tab commands
 * consume this surface instead of importing Agent event internals.
 */
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import type { WorkspaceAgentStatus } from "../../../domains/agent/state/chatStore";
import { chatStore } from "../../../domains/agent/state/chatStore";

type NotificationEventPayload = RpcFrontendMessagePayload<"notificationEvent">;
type ObserverStatusPayload = NonNullable<NotificationEventPayload["observerStatus"]>;
type AgentSessionLifecycleStatus = "running" | "waiting_input";

type AgentLifecycleEntry = {
  workspaceId: string;
  status: AgentSessionLifecycleStatus;
};

export const lifecycleBySessionKey = new Map<string, AgentLifecycleEntry>();

export function resolveLifecycleStatus(
  eventType: ObserverStatusPayload["normalizedEventType"],
): AgentSessionLifecycleStatus | null {
  if (eventType === "start") {
    return "running";
  }

  if (eventType === "wait_input") {
    return "waiting_input";
  }

  if (eventType === "stop") {
    return null;
  }

  return null;
}

/**
 * Aggregates session-level lifecycle states into one workspace-level status map.
 *
 * Priority per workspace is: `running` > `waiting_input` > absent (`idle`).
 */
export function deriveWorkspaceAgentStatusByWorkspaceId(
  lifecycle: ReadonlyMap<string, AgentLifecycleEntry>,
): Record<string, WorkspaceAgentStatus> {
  const statusByWorkspaceId: Record<string, WorkspaceAgentStatus> = {};

  for (const entry of lifecycle.values()) {
    const previousStatus = statusByWorkspaceId[entry.workspaceId];
    if (entry.status === "running") {
      statusByWorkspaceId[entry.workspaceId] = "running";
      continue;
    }

    if (previousStatus !== "running") {
      statusByWorkspaceId[entry.workspaceId] = "waiting_input";
    }
  }

  return statusByWorkspaceId;
}

export function parseObserverSessionKey(
  sessionKey: string,
): { workspaceId: string; tabId: string; paneId: string } | null {
  const [workspaceId, tabId, paneId] = sessionKey.split(":");
  if (!workspaceId || !tabId || !paneId) {
    return null;
  }

  return { workspaceId, tabId, paneId };
}

/**
 * Records one observer-status payload into the lifecycle map and re-derives
 * the workspace agent status map. The store mutation is injected so tests can
 * assert the exact derived map (mega-test 914 pattern).
 */
export function recordAgentObserverStatus(
  payload: NotificationEventPayload,
  dependencies: { setWorkspaceAgentStatusByWorkspaceId: (status: Record<string, WorkspaceAgentStatus>) => void },
): void {
  const workspaceId = payload.workspaceId?.trim();
  const observerStatus = payload.observerStatus;
  if (!observerStatus || !workspaceId) {
    return;
  }

  const sessionKey = observerStatus.sessionKey.trim();
  if (sessionKey.length === 0) {
    return;
  }

  const nextStatus = resolveLifecycleStatus(observerStatus.normalizedEventType);
  if (nextStatus === null) {
    lifecycleBySessionKey.delete(sessionKey);
  } else {
    lifecycleBySessionKey.set(sessionKey, {
      workspaceId,
      status: nextStatus,
    });
  }

  dependencies.setWorkspaceAgentStatusByWorkspaceId(deriveWorkspaceAgentStatusByWorkspaceId(lifecycleBySessionKey));
}

/**
 * Clears agent-status lifecycle entries for one terminal tab and re-derives
 * the workspace-level agent status map. Called when a terminal tab is
 * explicitly closed to prevent stale "running" state when the agent process
 * is killed without emitting a Stop hook.
 */
export function clearTerminalAgentStatus(tabId: string): void {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return;
  }

  let changed = false;
  for (const sessionKey of lifecycleBySessionKey.keys()) {
    const parsed = parseObserverSessionKey(sessionKey);
    if (parsed?.tabId === normalizedTabId) {
      lifecycleBySessionKey.delete(sessionKey);
      changed = true;
    }
  }

  if (changed) {
    chatStore.getState().setWorkspaceAgentStatusByWorkspaceId(deriveWorkspaceAgentStatusByWorkspaceId(lifecycleBySessionKey));
  }
}

/** Resets lifecycle state (test isolation + binding teardown). */
export function resetAgentLifecycleState(): void {
  lifecycleBySessionKey.clear();
}
