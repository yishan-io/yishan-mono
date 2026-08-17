import { workbenchNavigationStore } from "@renderer/features/workbench";
import { workspaceProjectionStore } from "../../state/workspaceProjectionStore";
import { selectWorkspaceFileTreeRefreshVersion } from "../../state/workspaceSelectors";
import { workspaceStore } from "../../state/workspaceStore";

/**
 * Workspace feature read-only hooks — the stable read surface for Workspace
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to workspace state
 * through these hooks instead of importing the Workspace Store directly.
 */

/** Subscribes to the selected workspace id. */
export function useSelectedWorkspaceId() {
  return workbenchNavigationStore((state) => state.activeWorkspaceId);
}

/** Subscribes to the worktree path of the selected workspace. */
export function useSelectedWorkspaceWorktreePath() {
  return workspaceStore(
    (state) =>
      state.workspaces
        .find((workspace) => workspace.id === workbenchNavigationStore.getState().activeWorkspaceId)
        ?.worktreePath?.trim() ?? "",
  );
}

/** Subscribes to the file-tree refresh version for the selected workspace. */
export function useWorkspaceGitRefreshVersion(worktreePath: string) {
  return workspaceStore((state) => {
    if (!worktreePath) {
      return 0;
    }
    return selectWorkspaceFileTreeRefreshVersion(worktreePath);
  });
}

/** Subscribes to the pull request map by workspace id. */
export function useWorkspacePullRequestByWorkspaceId() {
  return workspaceProjectionStore((state) => state.pullRequestByWorkspaceId);
}

/** Subscribes to the git change totals map by workspace id. */
export function useWorkspaceGitChangeTotalsByWorkspaceId() {
  return workspaceProjectionStore((state) => state.gitChangeTotalsByWorkspaceId);
}

/** Subscribes to the workspace list. */
export function useWorkspaces() {
  return workspaceStore((state) => state.workspaces);
}

/** Subscribes to the selected project id. */
export function useSelectedProjectId() {
  return workbenchNavigationStore((state) => state.activeProjectId);
}
