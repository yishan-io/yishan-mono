import type { WorkspaceItem } from "../workspaceTypes";

/** Inputs needed to choose the workspace that replaces one being closed. */
export type WorkspaceCloseSelectionInput = {
  closingWorkspaceId: string;
  orderedWorkspaceIds: readonly string[];
  preCloseWorkspaces: readonly WorkspaceItem[];
};

/**
 * Resolves the workspace to select after closing one workspace.
 *
 * Navigator order takes precedence only when it still contains the closing
 * workspace. In either order, the predecessor is preferred to the successor.
 */
export function resolveWorkspaceAfterClose(
  input: WorkspaceCloseSelectionInput,
): WorkspaceItem | undefined {
  const workspacesById = new Map<string, WorkspaceItem>();
  for (const workspace of input.preCloseWorkspaces) {
    if (!workspacesById.has(workspace.id)) {
      workspacesById.set(workspace.id, workspace);
    }
  }

  const navigatorWorkspaceIds = getUniqueKnownWorkspaceIds(input.orderedWorkspaceIds, workspacesById);
  if (navigatorWorkspaceIds.includes(input.closingWorkspaceId)) {
    const navigatorSelectionId = getAdjacentWorkspaceId(navigatorWorkspaceIds, input.closingWorkspaceId);
    return navigatorSelectionId ? workspacesById.get(navigatorSelectionId) : undefined;
  }

  const preCloseWorkspaceIds = getUniqueKnownWorkspaceIds(
    input.preCloseWorkspaces.map((workspace) => workspace.id),
    workspacesById,
  );
  const fallbackSelectionId = getAdjacentWorkspaceId(preCloseWorkspaceIds, input.closingWorkspaceId);
  return fallbackSelectionId ? workspacesById.get(fallbackSelectionId) : undefined;
}

function getUniqueKnownWorkspaceIds(
  workspaceIds: readonly string[],
  workspacesById: ReadonlyMap<string, WorkspaceItem>,
): string[] {
  const uniqueWorkspaceIds = new Set<string>();
  for (const workspaceId of workspaceIds) {
    if (workspacesById.has(workspaceId)) {
      uniqueWorkspaceIds.add(workspaceId);
    }
  }
  return [...uniqueWorkspaceIds];
}

function getAdjacentWorkspaceId(workspaceIds: readonly string[], closingWorkspaceId: string): string | undefined {
  const closingWorkspaceIndex = workspaceIds.indexOf(closingWorkspaceId);
  if (closingWorkspaceIndex < 0) {
    return undefined;
  }
  return workspaceIds[closingWorkspaceIndex - 1] ?? workspaceIds[closingWorkspaceIndex + 1];
}
