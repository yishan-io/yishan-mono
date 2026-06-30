import type { WorkspaceFrontendEventsMessage } from "@/features/workspaces/workspace-frontend-events";
import type { Workspace, WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";

import type { TerminalItem } from "../state/shell.types";
import {
  createSyncedTerminalItem,
  findMatchingTerminalForWorkspaceSession,
} from "./workspace-terminal-session-sync-domain";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type SyncWorkspaceRef = Pick<Workspace, "id" | "organizationId" | "projectId"> & { nodeId?: string | null };

export type WorkspaceTerminalSessionLifecycleEvent = {
  action: "created" | "destroyed";
  paneId?: string;
  pid: number;
  sessionId: string;
  startedAt?: string;
  status: "running" | "exited";
  tabId?: string;
  workspaceId: string;
};

type ReconcileWorkspaceTerminalSessionLifecycleEventResult = {
  changed: boolean;
  nextTerminalIds: string[];
  terminalIdsToRemove: string[];
  terminalsToUpsert: TerminalItem[];
};

function isValidLifecycleAction(value: unknown): value is WorkspaceTerminalSessionLifecycleEvent["action"] {
  return value === "created" || value === "destroyed";
}

function isValidSessionStatus(value: unknown): value is WorkspaceTerminalSessionLifecycleEvent["status"] {
  return value === "running" || value === "exited";
}

function buildSessionFromLifecycleEvent(event: WorkspaceTerminalSessionLifecycleEvent): WorkspaceTerminalSession {
  return {
    paneId: event.paneId,
    pid: event.pid,
    sessionId: event.sessionId,
    startedAt: event.startedAt,
    status: event.status,
    tabId: event.tabId,
    workspaceId: event.workspaceId,
  };
}

/**
 * Reads one terminal lifecycle frontend-event payload from the shared
 * workspace events stream.
 */
export function readWorkspaceTerminalSessionLifecycleEvent(
  message: WorkspaceFrontendEventsMessage,
): WorkspaceTerminalSessionLifecycleEvent | null {
  if (message.type !== "event" || message.topic !== "terminalSessionChanged") {
    return null;
  }

  const payload = message.payload;
  if (
    !payload ||
    !isValidLifecycleAction(payload.action) ||
    typeof payload.sessionId !== "string" ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.pid !== "number" ||
    !isValidSessionStatus(payload.status)
  ) {
    return null;
  }

  return {
    action: payload.action,
    paneId: typeof payload.paneId === "string" ? payload.paneId : undefined,
    pid: payload.pid,
    sessionId: payload.sessionId,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : undefined,
    status: payload.status,
    tabId: typeof payload.tabId === "string" ? payload.tabId : undefined,
    workspaceId: payload.workspaceId,
  };
}

/**
 * Reconciles one live terminal lifecycle event against the current local
 * terminal list using desktop-equivalent optimistic tab binding behavior.
 */
export function reconcileWorkspaceTerminalSessionLifecycleEvent(input: {
  localTerminals: TerminalItem[];
  event: WorkspaceTerminalSessionLifecycleEvent;
  t: Translate;
  workspace: SyncWorkspaceRef;
  workspaceLabel: string | null;
}): ReconcileWorkspaceTerminalSessionLifecycleEventResult {
  const staleRunningTabOwner =
    input.event.action === "created" && input.event.tabId
      ? (input.localTerminals.find(
          (terminal) =>
            terminal.id === input.event.tabId &&
            terminal.session?.sessionId &&
            terminal.session.sessionId !== input.event.sessionId &&
            terminal.session.status === "running",
        ) ?? null)
      : null;
  if (staleRunningTabOwner) {
    return {
      changed: false,
      nextTerminalIds: input.localTerminals.map((terminal) => terminal.id),
      terminalIdsToRemove: [],
      terminalsToUpsert: [],
    };
  }

  if (input.event.action === "destroyed") {
    const terminalToRemove =
      input.localTerminals.find((terminal) => terminal.session?.sessionId === input.event.sessionId) ?? null;
    if (!terminalToRemove) {
      return {
        changed: false,
        nextTerminalIds: input.localTerminals.map((terminal) => terminal.id),
        terminalIdsToRemove: [],
        terminalsToUpsert: [],
      };
    }

    return {
      changed: true,
      nextTerminalIds: input.localTerminals
        .filter((terminal) => terminal.id !== terminalToRemove.id)
        .map((terminal) => terminal.id),
      terminalIdsToRemove: [terminalToRemove.id],
      terminalsToUpsert: [],
    };
  }

  const session = buildSessionFromLifecycleEvent(input.event);
  const existingTerminal = findMatchingTerminalForWorkspaceSession(input.localTerminals, session);
  const syncedTerminal = createSyncedTerminalItem({
    existingTerminal,
    session,
    t: input.t,
    workspace: input.workspace,
    workspaceLabel: input.workspaceLabel,
  });

  if (existingTerminal) {
    if (syncedTerminal === existingTerminal) {
      return {
        changed: false,
        nextTerminalIds: input.localTerminals.map((terminal) => terminal.id),
        terminalIdsToRemove: [],
        terminalsToUpsert: [],
      };
    }

    return {
      changed: true,
      nextTerminalIds: input.localTerminals.map((terminal) => terminal.id),
      terminalIdsToRemove: [],
      terminalsToUpsert: [syncedTerminal],
    };
  }

  return {
    changed: true,
    nextTerminalIds: [syncedTerminal.id, ...input.localTerminals.map((terminal) => terminal.id)],
    terminalIdsToRemove: [],
    terminalsToUpsert: [syncedTerminal],
  };
}
