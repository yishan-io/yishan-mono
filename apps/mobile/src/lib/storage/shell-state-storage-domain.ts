import type {
  ShellWorkspaceTabState,
  TerminalItem,
  TerminalStatus,
  WorkspacePaneLayoutState,
} from "@/features/shell/state/shell.types";
import { trimTerminalOutputForCache } from "@/features/shell/state/terminal-output";

export const MAX_PERSISTED_TERMINALS_PER_WORKSPACE = 8;
export const MAX_PERSISTED_LABEL_LENGTH = 120;
export const MAX_PERSISTED_OUTPUT_LENGTH = 80000;
export const MAX_PERSISTED_PREVIEW_LENGTH = 240;
const DETACHED_WORKSPACE_ID = "__detached__";
const IMPORTED_TERMINAL_ID_PREFIX = "terminal-session-";

export type StoredShellState = {
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  selectedNodeIdByOrganization: Record<string, string>;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

export type StoredTerminalRuntimeItem = {
  cachedOutput?: string | null;
  id: string;
  lastMessagePreview?: string | null;
  session?: TerminalItem["session"];
  status?: TerminalStatus;
};

export type StoredTerminalRuntimeState = Record<string, StoredTerminalRuntimeItem[]>;

function truncate(value: string | null | undefined, maxLength: number): string | null | undefined {
  if (typeof value !== "string") {
    return value;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function isStoredTerminalSession(value: unknown): value is NonNullable<TerminalItem["session"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === "string" &&
    typeof record.workspaceId === "string" &&
    (record.status === "running" || record.status === "exited") &&
    (record.pid === undefined || typeof record.pid === "number") &&
    (record.startedAt === undefined || typeof record.startedAt === "string") &&
    (record.exitedAt === undefined || typeof record.exitedAt === "string")
  );
}

export function normalizeStoredTerminalSession(value: unknown, workspaceId: string): TerminalItem["session"] {
  if (isStoredTerminalSession(value)) {
    return value;
  }
  void workspaceId;
  return null;
}

export function compactTerminal(terminal: TerminalItem): TerminalItem {
  return {
    createdAt: terminal.createdAt,
    id: terminal.id,
    importedFromBackend:
      terminal.importedFromBackend === true || terminal.id.startsWith(IMPORTED_TERMINAL_ID_PREFIX) ? true : undefined,
    label: truncate(terminal.label, MAX_PERSISTED_LABEL_LENGTH) ?? "",
    modelId: terminal.modelId,
    nodeId: terminal.nodeId,
    orgId: terminal.orgId,
    projectId: terminal.projectId,
    subtitle: truncate(terminal.subtitle, MAX_PERSISTED_LABEL_LENGTH) ?? null,
    updatedAt: terminal.updatedAt,
    userRenamed: terminal.userRenamed === true ? true : undefined,
    workspaceId: terminal.workspaceId,
  };
}

export function compactTerminalRuntime(terminal: TerminalItem): StoredTerminalRuntimeItem {
  return {
    cachedOutput:
      typeof terminal.cachedOutput === "string"
        ? trimTerminalOutputForCache(terminal.cachedOutput, MAX_PERSISTED_OUTPUT_LENGTH)
        : null,
    id: terminal.id,
    lastMessagePreview: truncate(terminal.lastMessagePreview, MAX_PERSISTED_PREVIEW_LENGTH) ?? null,
    session: terminal.session,
    status: terminal.status,
  };
}

function isGhostTerminalCandidate(terminal: TerminalItem) {
  const hasSessionId = typeof terminal.session?.sessionId === "string" && terminal.session.sessionId.length > 0;
  const hasCachedOutput = typeof terminal.cachedOutput === "string" && terminal.cachedOutput.trim().length > 0;
  const hasPreview = typeof terminal.lastMessagePreview === "string" && terminal.lastMessagePreview.trim().length > 0;

  return !hasSessionId && !hasCachedOutput && !hasPreview;
}

export function dedupeGhostTerminals(terminals: TerminalItem[]): TerminalItem[] {
  const latestByGhostKey = new Map<string, TerminalItem>();
  const preserved: TerminalItem[] = [];

  for (const terminal of terminals) {
    if (!isGhostTerminalCandidate(terminal)) {
      preserved.push(terminal);
      continue;
    }

    const ghostKey = `${terminal.workspaceId}\u0000${terminal.label.trim()}\u0000${terminal.subtitle ?? ""}`;
    const previous = latestByGhostKey.get(ghostKey);
    if (!previous) {
      latestByGhostKey.set(ghostKey, terminal);
      continue;
    }

    const previousCreatedAt = previous.createdAt ?? previous.updatedAt;
    const nextCreatedAt = terminal.createdAt ?? terminal.updatedAt;
    if (nextCreatedAt.localeCompare(previousCreatedAt) >= 0) {
      latestByGhostKey.set(ghostKey, terminal);
    }
  }

  return [...preserved, ...latestByGhostKey.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function toPersistedShellState(state: StoredShellState): StoredShellState {
  return {
    paneLayoutByWorkspaceId: Object.fromEntries(
      Object.entries(state.paneLayoutByWorkspaceId).filter(([workspaceId]) => workspaceId !== DETACHED_WORKSPACE_ID),
    ),
    selectedNodeIdByOrganization: state.selectedNodeIdByOrganization,
    terminalsByWorkspaceId: Object.fromEntries(
      Object.entries(state.terminalsByWorkspaceId)
        .filter(([workspaceId]) => workspaceId !== DETACHED_WORKSPACE_ID)
        .map(([workspaceId, terminals]) => [
          workspaceId,
          dedupeGhostTerminals(terminals).slice(0, MAX_PERSISTED_TERMINALS_PER_WORKSPACE).map(compactTerminal),
        ]),
    ),
    workspaceTabStateByWorkspaceId: Object.fromEntries(
      Object.entries(state.workspaceTabStateByWorkspaceId).filter(
        ([workspaceId]) => workspaceId !== DETACHED_WORKSPACE_ID,
      ),
    ),
  };
}
