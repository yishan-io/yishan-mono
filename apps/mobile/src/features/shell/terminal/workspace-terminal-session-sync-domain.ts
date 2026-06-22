import type { Workspace, WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";

import type { TerminalItem } from "../state/shell.types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type SyncWorkspaceRef = Pick<Workspace, "id" | "organizationId" | "projectId"> & { nodeId?: string | null };

type ReconcileWorkspaceTerminalSessionSyncInput = {
  localTerminals: TerminalItem[];
  sessions: WorkspaceTerminalSession[];
  suppressedSessionIds?: Set<string>;
  t: Translate;
  workspace: SyncWorkspaceRef;
  workspaceLabel: string | null;
};

type ReconcileWorkspaceTerminalSessionSyncResult = {
  syncedTerminalIds: string[];
  syncedTerminals: TerminalItem[];
  terminalIdsToRemove: string[];
};

type ShouldAutoSyncWorkspaceTerminalSessionInput = {
  lastSyncedWorkspaceKey: string | null;
  workspaceKey: string;
};

type ResolveWorkspaceTerminalSessionSyncResetInput = {
  accessToken: string | null;
  enabled: boolean;
  status: "authenticated" | "loading" | "signed-out";
  workspaceKey: string | null;
};

const IMPORTED_TERMINAL_ID_PREFIX = "terminal-session-";

/**
 * Builds the visible label for a backend-imported terminal session.
 */
export function buildImportedTerminalLabel(session: WorkspaceTerminalSession, t: Translate) {
  const startedAt = session.startedAt ? new Date(session.startedAt) : null;
  if (startedAt && !Number.isNaN(startedAt.getTime())) {
    return `${t("shell.terminal")} ${startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  return t("shell.terminal");
}

/**
 * Auto-sync should run once per selected workspace key and then wait for an
 * explicit refresh or workspace switch.
 */
export function shouldAutoSyncWorkspaceTerminalSession({
  lastSyncedWorkspaceKey,
  workspaceKey,
}: ShouldAutoSyncWorkspaceTerminalSessionInput) {
  return lastSyncedWorkspaceKey !== workspaceKey;
}

/**
 * Determines whether auto-sync state should reset, hold, or use a concrete
 * workspace key during workspace selection transitions.
 */
export function resolveWorkspaceTerminalSessionSyncReset({
  accessToken,
  enabled,
  status,
  workspaceKey,
}: ResolveWorkspaceTerminalSessionSyncResetInput) {
  if (!enabled || status !== "authenticated" || !accessToken) {
    return {
      nextWorkspaceKey: null,
      shouldReset: true,
    };
  }

  if (!workspaceKey) {
    return {
      nextWorkspaceKey: null,
      shouldReset: false,
    };
  }

  return {
    nextWorkspaceKey: workspaceKey,
    shouldReset: false,
  };
}

/**
 * Sorts backend sessions newest-first by their start time.
 */
export function compareTerminalSessions(left: WorkspaceTerminalSession, right: WorkspaceTerminalSession) {
  const leftStartedAt = left.startedAt ?? "";
  const rightStartedAt = right.startedAt ?? "";
  return rightStartedAt.localeCompare(leftStartedAt);
}

/**
 * Detects whether a local terminal was imported from a backend session sync.
 */
export function isImportedBackendTerminal(terminal: TerminalItem) {
  return terminal.importedFromBackend === true || terminal.id.startsWith(IMPORTED_TERMINAL_ID_PREFIX);
}

/**
 * Creates the local terminal shape used to mirror an existing backend session.
 */
export function createImportedTerminalItem({
  session,
  t,
  workspace,
  workspaceLabel,
}: {
  session: WorkspaceTerminalSession;
  t: Translate;
  workspace: SyncWorkspaceRef;
  workspaceLabel: string | null;
}): TerminalItem {
  const timestamp = session.startedAt ?? new Date().toISOString();
  const terminalId = session.tabId?.trim() ? session.tabId : `terminal-session-${session.sessionId}`;

  return {
    createdAt: timestamp,
    id: terminalId,
    importedFromBackend: true,
    label: buildImportedTerminalLabel(session, t),
    nodeId: workspace.nodeId,
    orgId: workspace.organizationId,
    projectId: workspace.projectId,
    session: {
      exitedAt: session.exitedAt,
      paneId: session.paneId,
      pid: session.pid,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      status: session.status,
      tabId: session.tabId,
      workspaceId: session.workspaceId,
    },
    status: session.status === "running" ? "running" : "idle",
    subtitle: workspaceLabel,
    updatedAt: timestamp,
    workspaceId: workspace.id,
  };
}

/**
 * Finds one local terminal that already owns or requested the backend session.
 */
export function findMatchingTerminalForWorkspaceSession(
  localTerminals: TerminalItem[],
  session: Pick<WorkspaceTerminalSession, "sessionId" | "tabId">,
) {
  return (
    localTerminals.find(
      (terminal) =>
        terminal.session?.sessionId === session.sessionId || (!!session.tabId && terminal.id === session.tabId),
    ) ?? null
  );
}

/**
 * Builds the final synced terminal by merging backend session state into one
 * existing local terminal when available.
 */
export function createSyncedTerminalItem({
  existingTerminal,
  session,
  t,
  workspace,
  workspaceLabel,
}: {
  existingTerminal: TerminalItem | null;
  session: WorkspaceTerminalSession;
  t: Translate;
  workspace: SyncWorkspaceRef;
  workspaceLabel: string | null;
}): TerminalItem {
  const importedTerminal = createImportedTerminalItem({
    session,
    t,
    workspace,
    workspaceLabel,
  });
  if (!existingTerminal) {
    return importedTerminal;
  }

  const preserveExistingLabel = existingTerminal.userRenamed === true || !isImportedBackendTerminal(existingTerminal);

  return {
    ...existingTerminal,
    ...importedTerminal,
    createdAt: existingTerminal.createdAt ?? importedTerminal.createdAt,
    id: existingTerminal.id,
    importedFromBackend: isImportedBackendTerminal(existingTerminal) ? true : undefined,
    label: preserveExistingLabel ? existingTerminal.label : importedTerminal.label,
    userRenamed: existingTerminal.userRenamed,
  };
}

/**
 * Reconciles remote terminal sessions against local mirrored terminals.
 */
export function reconcileWorkspaceTerminalSessionSync({
  localTerminals,
  sessions,
  suppressedSessionIds = new Set<string>(),
  t,
  workspace,
  workspaceLabel,
}: ReconcileWorkspaceTerminalSessionSyncInput): ReconcileWorkspaceTerminalSessionSyncResult {
  const visibleSessions = [...sessions]
    .filter((session) => !suppressedSessionIds.has(session.sessionId))
    .sort(compareTerminalSessions);
  const visibleSessionIds = new Set(visibleSessions.map((session) => session.sessionId));

  const syncedTerminalIds: string[] = [];
  const syncedTerminals: TerminalItem[] = [];

  for (const session of visibleSessions) {
    const existingTerminal = findMatchingTerminalForWorkspaceSession(localTerminals, session);
    const syncedTerminal = createSyncedTerminalItem({
      existingTerminal,
      session,
      t,
      workspace,
      workspaceLabel,
    });

    syncedTerminalIds.push(syncedTerminal.id);
    syncedTerminals.push(syncedTerminal);
  }

  return {
    syncedTerminalIds,
    syncedTerminals,
    terminalIdsToRemove: localTerminals
      .filter((terminal) => !!terminal.session?.sessionId && !visibleSessionIds.has(terminal.session.sessionId))
      .map((terminal) => terminal.id),
  };
}
