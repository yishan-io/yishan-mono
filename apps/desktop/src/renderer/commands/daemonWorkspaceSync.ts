import { getDaemonClient } from "../rpc/rpcTransport";
import { workspaceStore } from "../store/workspaceStore";

function resolveVisibleWorkspaceTargets() {
  const state = workspaceStore.getState();
  const visibleProjectIds = new Set((state.displayProjectIds ?? []).map((projectId) => projectId.trim()).filter(Boolean));

  return state.workspaces.filter((workspace) => {
    const worktreePath = workspace.worktreePath?.trim();
    if (!worktreePath) {
      return false;
    }
    const projectId = (workspace.projectId ?? workspace.repoId).trim();
    return visibleProjectIds.has(projectId);
  });
}

/**
 * Ensures all currently visible workspaces are registered in the daemon.
 *
 * @param mergedWorkspaceIds - Set of workspace IDs whose latest PR is already
 *   merged. The daemon will skip PR polling for these workspaces.
 */
export async function ensureVisibleWorkspacesOpen(mergedWorkspaceIds?: ReadonlySet<string>): Promise<void> {
  const targets = resolveVisibleWorkspaceTargets();
  if (targets.length === 0) {
    if (import.meta.env.DEV) {
      console.debug("[daemonWorkspaceSync] no visible workspaces to open");
    }
    return;
  }

  if (import.meta.env.DEV) {
    console.debug(
      "[daemonWorkspaceSync] visible workspace targets",
      targets.map((workspace) => ({
        workspaceId: workspace.id,
        projectId: workspace.projectId ?? workspace.repoId,
        worktreePath: workspace.worktreePath?.trim() ?? "",
      })),
    );
  }

  const client = await getDaemonClient();
  const daemonWorkspaces = await client.workspace.list();
  const openPaths = new Set(daemonWorkspaces.map((workspace) => workspace.path.trim()).filter(Boolean));

  if (import.meta.env.DEV) {
    console.debug("[daemonWorkspaceSync] daemon already-open workspaces", [...openPaths]);
  }

  await Promise.all(
    targets.map(async (workspace) => {
      const worktreePath = workspace.worktreePath?.trim() ?? "";
      if (!worktreePath || openPaths.has(worktreePath)) {
        if (import.meta.env.DEV) {
          console.debug("[daemonWorkspaceSync] skipping workspace open", {
            workspaceId: workspace.id,
            worktreePath,
            reason: !worktreePath ? "missing-path" : "already-open",
          });
        }
        return;
      }

      if (import.meta.env.DEV) {
        console.debug("[daemonWorkspaceSync] opening workspace in daemon", {
          workspaceId: workspace.id,
          worktreePath,
          pullRequestAlreadyMerged: mergedWorkspaceIds?.has(workspace.id) ?? false,
        });
      }
      await client.workspace.open({
        workspaceId: workspace.id,
        workspaceWorktreePath: worktreePath,
        orgId: workspace.organizationId,
        projectId: workspace.projectId,
        pullRequestAlreadyMerged: mergedWorkspaceIds?.has(workspace.id) ?? false,
      });
      openPaths.add(worktreePath);
    }),
  );
}
