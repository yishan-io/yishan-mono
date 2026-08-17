import { getDaemonClient } from "../../../rpc/rpcTransport";
import { selectSelectedOrganizationId } from "../../../features/session/state/sessionSelectors";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";

type WorkspaceOpenProjectEntry = {
  workspaceId: string;
  worktreePath: string;
  projectId: string;
  orgId: string;
};

type WorkspaceOpenCandidate = {
  id: string;
  projectId?: string;
  repoId?: string;
  worktreePath?: string;
  state?: "active" | "error" | "closing";
};

export function buildWorkspaceOpenProjectEntries(
  workspaces: WorkspaceOpenCandidate[],
  organizationId: string,
): WorkspaceOpenProjectEntry[] {
  return workspaces.flatMap((workspace) => {
    const projectId = workspace.projectId ?? workspace.repoId ?? "";
    const worktreePath = workspace.worktreePath?.trim() ?? "";
    if (!projectId || !workspace.id || !worktreePath) {
      return [];
    }
    // Error workspaces are close-only: never warm them up, otherwise a
    // successful open would clobber the persisted error state back to active.
    if (workspace.state === "error") {
      return [];
    }
    return [{ workspaceId: workspace.id, worktreePath, projectId, orgId: organizationId }];
  });
}

export async function openWorkspaceEntries(entries: WorkspaceOpenProjectEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  try {
    const client = await getDaemonClient();
    await client.workspace.openProject({ workspaces: entries });
  } catch (error) {
    console.error("[warmup] workspace.openProject failed", error);
  }
}

/**
 * Opens (warms up) all workspaces belonging to the given project IDs on the
 * daemon side. Workspaces are persisted in the local SQLite database so
 * daemon restarts restore them via DB hydration. Already-open workspaces
 * are skipped (idempotent on the daemon).
 */
export async function warmupWorkspacesForProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) {
    return;
  }
  const projectIdSet = new Set(projectIds);
  const { workspaces } = workspaceStore.getState();
  const orgId = selectSelectedOrganizationId() ?? "";

  const entries = buildWorkspaceOpenProjectEntries(
    workspaces.filter((workspace) => {
      const projectId = workspace.projectId ?? workspace.repoId ?? "";
      return projectIdSet.has(projectId);
    }),
    orgId,
  );

  await openWorkspaceEntries(entries);
}

/**
 * Stops all terminal sessions for workspaces belonging to the given project
 * IDs. Used when the user unpins (hides) those projects. Does not remove
 * workspaces from the daemon or index — they are preserved for restart recovery.
 */
export async function closeWorkspacesForProjects(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) {
    return;
  }
  const projectIdSet = new Set(projectIds);
  const { workspaces } = workspaceStore.getState();

  const workspaceIds = workspaces
    .filter((ws) => {
      const projectId = ws.projectId ?? ws.repoId ?? "";
      return projectIdSet.has(projectId) && Boolean(ws.id);
    })
    .map((ws) => ws.id);

  if (workspaceIds.length === 0) {
    return;
  }

  try {
    const client = await getDaemonClient();
    await client.workspace.closeProject({ workspaceIds });
  } catch (error) {
    console.error("[warmup] workspace.closeProject failed", error);
  }
}
