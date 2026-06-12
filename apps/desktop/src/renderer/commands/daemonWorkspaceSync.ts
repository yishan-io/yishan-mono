import { getErrorMessage } from "../helpers/errorHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { workspaceStore } from "../store/workspaceStore";

type WorkspaceSnapshotRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  worktreePath?: string;
};

function normalizeWorkspacePath(path: string | undefined): string {
  return path?.trim() ?? "";
}

function resolveVisibleWorkspaceTargets() {
  const state = workspaceStore.getState();
  const visibleProjectIds = new Set(
    (state.displayProjectIds ?? []).map((projectId) => projectId.trim()).filter(Boolean),
  );

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
  const daemonWorkspaceByPath = new Map(daemonWorkspaces.map((workspace) => [workspace.path.trim(), workspace]));

  // Seed daemon PR info from already-open workspaces so the popover can show
  // live PR data immediately without waiting for the next polling interval.
  for (const daemonWorkspace of daemonWorkspaces) {
    if (daemonWorkspace.pullRequest) {
      workspaceStore.getState().setWorkspacePullRequest(daemonWorkspace.id, daemonWorkspace.pullRequest);
    }
  }

  if (import.meta.env.DEV) {
    console.debug("[daemonWorkspaceSync] daemon already-open workspaces", [...daemonWorkspaceByPath.keys()]);
  }

  await Promise.all(
    targets.map(async (workspace) => {
      const worktreePath = workspace.worktreePath?.trim() ?? "";
      const existingDaemonWorkspace = daemonWorkspaceByPath.get(worktreePath);
      const isAlreadyRegistered =
        existingDaemonWorkspace?.id === workspace.id &&
        existingDaemonWorkspace.orgId === workspace.organizationId &&
        existingDaemonWorkspace.projectId === workspace.projectId;
      if (!worktreePath || isAlreadyRegistered) {
        if (import.meta.env.DEV) {
          console.debug("[daemonWorkspaceSync] skipping workspace open", {
            workspaceId: workspace.id,
            worktreePath,
            reason: !worktreePath ? "missing-path" : "already-registered",
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

      try {
        const openedWorkspace = await client.workspace.open({
          workspaceId: workspace.id,
          workspaceWorktreePath: worktreePath,
          orgId: workspace.organizationId,
          projectId: workspace.projectId,
          pullRequestAlreadyMerged: mergedWorkspaceIds?.has(workspace.id) ?? false,
        });
        daemonWorkspaceByPath.set(worktreePath, {
          id: openedWorkspace.id,
          path: openedWorkspace.path,
          orgId: workspace.organizationId,
          projectId: workspace.projectId,
          pullRequest: openedWorkspace.pullRequest,
        });
        if (openedWorkspace?.pullRequest) {
          workspaceStore.getState().setWorkspacePullRequest(openedWorkspace.id, openedWorkspace.pullRequest);
        }
      } catch (error) {
        console.warn("[daemonWorkspaceSync] failed to open workspace in daemon; closing stale entry", {
          workspaceId: workspace.id,
          worktreePath,
          error: getErrorMessage(error),
        });
        try {
          await client.workspace.close({
            workspaceId: workspace.id,
            organizationId: workspace.organizationId,
            projectId: workspace.projectId,
            branch: workspace.branch,
            removeBranch: true,
          });
        } catch (closeError) {
          console.warn("[daemonWorkspaceSync] failed to close stale workspace after open failure", {
            workspaceId: workspace.id,
            worktreePath,
            error: getErrorMessage(closeError),
          });
        }
      }
    }),
  );
}

/**
 * Closes daemon workspaces that are no longer present in the latest backend snapshot.
 */
export async function reconcileDaemonWorkspaces(snapshotWorkspaces: WorkspaceSnapshotRecord[]): Promise<void> {
  const client = await getDaemonClient();
  const daemonWorkspaces = await client.workspace.list();
  const snapshotPathSet = new Set(
    snapshotWorkspaces.map((workspace) => normalizeWorkspacePath(workspace.worktreePath)).filter(Boolean),
  );

  await Promise.all(
    daemonWorkspaces.map(async (daemonWorkspace) => {
      const daemonPath = daemonWorkspace.path.trim();
      if (!daemonPath || snapshotPathSet.has(daemonPath)) {
        return;
      }

      const snapshotMatch = snapshotWorkspaces.find(
        (workspace) => normalizeWorkspacePath(workspace.worktreePath) === daemonPath,
      );
      try {
        await client.workspace.close({
          workspaceId: daemonWorkspace.id,
          organizationId: snapshotMatch?.organizationId ?? daemonWorkspace.orgId,
          projectId: snapshotMatch?.projectId ?? daemonWorkspace.projectId,
        });
      } catch (error) {
        console.warn("[daemonWorkspaceSync] failed to close stale daemon workspace", {
          workspaceId: daemonWorkspace.id,
          worktreePath: daemonPath,
          error,
        });
      }
    }),
  );
}
