import { supportsGitFeatures } from "@renderer/domains/project";
import { selectProjects } from "@renderer/domains/project";
/**
 * All-workspaces git sync runtime (desktop6-adjust.md W4).
 *
 * Long-lived resource: owns the per-workspace refresh state map (in-flight +
 * queue + throttle timers) and the last-seen refresh version record, and
 * subscribes to the Git projection store so git refresh version bumps
 * trigger throttled `refreshWorkspaceGitChanges` for every affected
 * workspace — including non-selected ones. The selected workspace is skipped
 * because it is already handled by WorkspaceView's own effect.
 */
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { selectWorkspaces } from "@renderer/domains/workspace";
import { isFolderWorkspace } from "@renderer/domains/workspace";
import { refreshWorkspaceGitChanges } from "../commands/gitProjectionCommands";
import { gitProjectionStore } from "../state/gitProjectionStore";

/**
 * Minimum interval (ms) between consecutive refresh calls for one workspace.
 * This prevents excessive RPC traffic when rapid-fire git events arrive.
 */
export const REFRESH_THROTTLE_MS = 300;

export type WorkspaceRefreshState = {
  inFlight: boolean;
  queued: boolean;
  lastFinishedAt: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * Schedules a throttled refresh for one workspace. If a refresh is already
 * in-flight, queues one additional refresh. Enforces a minimum interval
 * between consecutive refresh completions to avoid excessive RPC traffic.
 */
export async function scheduleWorkspaceRefresh(
  workspaceId: string,
  worktreePath: string,
  stateMap: Map<string, WorkspaceRefreshState>,
  doRefresh: (workspaceId: string, worktreePath: string) => Promise<void> = refreshWorkspaceGitChanges,
): Promise<void> {
  let entry = stateMap.get(workspaceId);
  if (!entry) {
    entry = { inFlight: false, queued: false, lastFinishedAt: 0, pendingTimer: null };
    stateMap.set(workspaceId, entry);
  }

  if (entry.inFlight) {
    entry.queued = true;
    return;
  }

  const now = Date.now();
  const elapsed = now - entry.lastFinishedAt;
  if (elapsed < REFRESH_THROTTLE_MS) {
    if (!entry.pendingTimer) {
      entry.queued = true;
      entry.pendingTimer = setTimeout(() => {
        const currentEntry = stateMap.get(workspaceId);
        if (currentEntry) {
          currentEntry.pendingTimer = null;
          if (currentEntry.queued) {
            currentEntry.queued = false;
            void scheduleWorkspaceRefresh(workspaceId, worktreePath, stateMap, doRefresh);
          }
        }
      }, REFRESH_THROTTLE_MS - elapsed);
    }
    return;
  }

  entry.inFlight = true;
  try {
    await doRefresh(workspaceId, worktreePath);
  } finally {
    entry.inFlight = false;
    entry.lastFinishedAt = Date.now();
    if (entry.queued) {
      entry.queued = false;
      void scheduleWorkspaceRefresh(workspaceId, worktreePath, stateMap, doRefresh);
    }
  }
}

/**
 * Creates the all-workspaces git sync runtime. Owns the per-workspace refresh
 * state and subscribes to Git projection store version bumps.
 */
export function createAllWorkspacesGitSyncRuntime() {
  const refreshStateByWorkspaceId = new Map<string, WorkspaceRefreshState>();
  const lastSeenVersionByWorktreePath: Record<string, number> = {};
  let lastVersionMap: Record<string, number> | undefined;

  function onProjectionChanged(versionByWorktreePath: Record<string, number>): void {
    if (versionByWorktreePath === lastVersionMap) {
      return;
    }
    lastVersionMap = versionByWorktreePath;

    const workspaces = selectWorkspaces();
    const selectedWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
    const lastSeen = lastSeenVersionByWorktreePath;
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const projectByProjectId = new Map(selectProjects().map((project) => [project.id, project]));

    for (const workspaceId of refreshStateByWorkspaceId.keys()) {
      if (!activeWorkspaceIds.has(workspaceId)) {
        const refreshState = refreshStateByWorkspaceId.get(workspaceId);
        if (refreshState?.pendingTimer) {
          clearTimeout(refreshState.pendingTimer);
        }
        refreshStateByWorkspaceId.delete(workspaceId);
      }
    }

    const activeWorktreePaths = new Set(
      workspaces
        .map((workspace) => workspace.worktreePath?.trim())
        .filter((workspaceWorktreePath): workspaceWorktreePath is string => Boolean(workspaceWorktreePath)),
    );
    for (const worktreePath of Object.keys(lastSeen)) {
      if (!activeWorktreePaths.has(worktreePath)) {
        delete lastSeen[worktreePath];
      }
    }

    for (const workspace of workspaces) {
      const worktreePath = workspace.worktreePath?.trim();
      if (!worktreePath) {
        continue;
      }

      // Skip the selected workspace - it's already handled by WorkspaceView's own effect
      if (workspace.id === selectedWorkspaceId) {
        continue;
      }

      // Folder workspaces (kind="folder"/sentinel project id) and non-git
      // projects have no git state to poll.
      if (isFolderWorkspace(workspace)) {
        continue;
      }
      const project = projectByProjectId.get(workspace.projectId ?? workspace.repoId);
      if (!supportsGitFeatures(project?.sourceType)) {
        continue;
      }

      const currentVersion = versionByWorktreePath[worktreePath] ?? 0;
      const previousVersion = lastSeen[worktreePath] ?? 0;

      if (currentVersion > previousVersion) {
        lastSeen[worktreePath] = currentVersion;
        void scheduleWorkspaceRefresh(workspace.id, worktreePath, refreshStateByWorkspaceId);
      }
    }
  }

  return {
    /** Subscribes to projection store changes. Returns a stop function. */
    start(): () => void {
      const unsubscribe = gitProjectionStore.subscribe((state) => {
        onProjectionChanged(state.gitRefreshVersionByWorktreePath);
      });
      onProjectionChanged(gitProjectionStore.getState().gitRefreshVersionByWorktreePath);
      return () => {
        unsubscribe();
      };
    },
  };
}

export type AllWorkspacesGitSyncRuntime = ReturnType<typeof createAllWorkspacesGitSyncRuntime>;
