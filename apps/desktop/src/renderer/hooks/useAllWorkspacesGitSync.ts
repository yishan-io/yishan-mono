import { useEffect, useRef } from "react";
import { refreshWorkspaceGitChanges } from "../commands/workspaceCommands";
import { workspaceStore } from "../store/workspaceStore";

/**
 * Minimum interval (ms) between consecutive refresh calls for one workspace.
 * This prevents excessive RPC traffic when rapid-fire git events arrive.
 */
export const REFRESH_THROTTLE_MS = 300;

type WorkspaceRefreshState = {
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
 * Subscribes to git refresh version changes for ALL workspaces and triggers
 * `refreshWorkspaceGitChanges` for each affected workspace, including those
 * that are not currently selected.
 *
 * Uses per-workspace in-flight + queue guards and a throttle interval to avoid
 * excessive RPC traffic while ensuring every workspace eventually reflects the
 * latest git state.
 *
 * The selected workspace is skipped because it is already handled by the
 * existing `useEffect` in `WorkspaceView`.
 */
export function useAllWorkspacesGitSync() {
  const refreshStateByWorkspaceId = useRef(new Map<string, WorkspaceRefreshState>());
  const lastSeenVersionByWorktreePath = useRef<Record<string, number>>({});

  const gitRefreshVersionByWorktreePath = workspaceStore((state) => state.gitRefreshVersionByWorktreePath);

  useEffect(() => {
    const state = workspaceStore.getState();
    const workspaces = state.workspaces;
    const selectedWorkspaceId = state.selectedWorkspaceId;
    const lastSeen = lastSeenVersionByWorktreePath.current;
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));

    for (const workspaceId of refreshStateByWorkspaceId.current.keys()) {
      if (!activeWorkspaceIds.has(workspaceId)) {
        const refreshState = refreshStateByWorkspaceId.current.get(workspaceId);
        if (refreshState?.pendingTimer) {
          clearTimeout(refreshState.pendingTimer);
        }
        refreshStateByWorkspaceId.current.delete(workspaceId);
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

      const currentVersion = gitRefreshVersionByWorktreePath[worktreePath] ?? 0;
      const previousVersion = lastSeen[worktreePath] ?? 0;

      if (currentVersion > previousVersion) {
        lastSeen[worktreePath] = currentVersion;
        void scheduleWorkspaceRefresh(workspace.id, worktreePath, refreshStateByWorkspaceId.current);
      }
    }
  }, [gitRefreshVersionByWorktreePath]);
}
