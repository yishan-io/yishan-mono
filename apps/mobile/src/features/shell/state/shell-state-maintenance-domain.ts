import type { ShellSelection, ShellWorkspaceTabState, TerminalItem, WorkspacePaneLayoutState } from "./shell.types";

type ShellStoredStateSnapshot = {
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

type DroppedWorkspaceStoredState = {
  nextPaneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  nextSelection: ShellSelection;
  nextTerminalsByWorkspaceId: Record<string, TerminalItem[]>;
  nextWorkspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
  workspaceTerminalIds: string[];
};

type DroppedProjectStoredState = {
  nextPaneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  nextSelection: ShellSelection;
  nextTerminalsByWorkspaceId: Record<string, TerminalItem[]>;
  nextWorkspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
  projectTerminalIds: string[];
};

function omitWorkspaceId<T>(record: Record<string, T>, workspaceId: string): Record<string, T> {
  if (!(workspaceId in record)) {
    return record;
  }

  const next = { ...record };
  delete next[workspaceId];
  return next;
}

function omitWorkspaceIds<T>(record: Record<string, T>, workspaceIds: Set<string>): Record<string, T> {
  let changed = false;
  const next = { ...record };

  for (const workspaceId of workspaceIds) {
    if (!(workspaceId in next)) {
      continue;
    }

    changed = true;
    delete next[workspaceId];
  }

  return changed ? next : record;
}

/**
 * Derives the next persisted shell state after removing one workspace.
 */
export function dropWorkspaceStoredState(
  storedState: ShellStoredStateSnapshot,
  selection: ShellSelection,
  workspaceId: string,
): DroppedWorkspaceStoredState {
  const workspaceTerminalIds = (storedState.terminalsByWorkspaceId[workspaceId] ?? []).map((terminal) => terminal.id);
  const nextTerminalsByWorkspaceId = omitWorkspaceId(storedState.terminalsByWorkspaceId, workspaceId);
  const nextWorkspaceTabStateByWorkspaceId = omitWorkspaceId(storedState.workspaceTabStateByWorkspaceId, workspaceId);
  const nextPaneLayoutByWorkspaceId = omitWorkspaceId(storedState.paneLayoutByWorkspaceId, workspaceId);
  const nextSelection =
    selection.kind !== "home" && selection.workspaceId === workspaceId ? ({ kind: "home" } as const) : selection;

  return {
    nextPaneLayoutByWorkspaceId,
    nextSelection,
    nextTerminalsByWorkspaceId,
    nextWorkspaceTabStateByWorkspaceId,
    workspaceTerminalIds,
  };
}

/**
 * Derives the next persisted shell state after removing one project and its workspaces.
 */
export function dropProjectStoredState(
  storedState: ShellStoredStateSnapshot,
  selection: ShellSelection,
  organizationId: string,
  projectId: string,
  workspaceIds: string[],
): DroppedProjectStoredState {
  const scopedWorkspaceIds = new Set(workspaceIds);
  const projectTerminalIds = workspaceIds.flatMap((workspaceId) =>
    (storedState.terminalsByWorkspaceId[workspaceId] ?? []).map((terminal) => terminal.id),
  );
  const nextTerminalsByWorkspaceId = omitWorkspaceIds(storedState.terminalsByWorkspaceId, scopedWorkspaceIds);
  const nextWorkspaceTabStateByWorkspaceId = omitWorkspaceIds(
    storedState.workspaceTabStateByWorkspaceId,
    scopedWorkspaceIds,
  );
  const nextPaneLayoutByWorkspaceId = omitWorkspaceIds(storedState.paneLayoutByWorkspaceId, scopedWorkspaceIds);
  const nextSelection =
    selection.kind !== "home" && selection.orgId === organizationId && selection.projectId === projectId
      ? ({ kind: "home" } as const)
      : selection;

  return {
    nextPaneLayoutByWorkspaceId,
    nextSelection,
    nextTerminalsByWorkspaceId,
    nextWorkspaceTabStateByWorkspaceId,
    projectTerminalIds,
  };
}

/**
 * Sorts recent terminals across all workspaces for shell home surfaces.
 */
export function listRecentTerminals(
  terminalsByWorkspaceId: Record<string, TerminalItem[]>,
  limit: number,
): TerminalItem[] {
  return Object.values(terminalsByWorkspaceId)
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}
