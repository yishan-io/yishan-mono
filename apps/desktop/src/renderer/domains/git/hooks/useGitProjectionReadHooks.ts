/**
 * Git feature read hooks (desktop6-adjust.md W4).
 *
 * Cross-feature UI subscribes to Git projections through these hooks instead
 * of importing the Git Store directly. The projections previously lived in
 * the Workspace feature (`useWorkspaceReadHooks`).
 */
import { gitProjectionStore } from "../state/gitProjectionStore";

/** Subscribes to the git refresh version for a worktree path. */
export function useWorkspaceGitRefreshVersion(worktreePath: string) {
  return gitProjectionStore((state) => {
    if (!worktreePath) {
      return 0;
    }
    return state.gitRefreshVersionByWorktreePath?.[worktreePath] ?? 0;
  });
}

/** Subscribes to the pull request map by workspace id. */
export function useWorkspacePullRequestByWorkspaceId() {
  return gitProjectionStore((state) => state.pullRequestByWorkspaceId);
}

/** Subscribes to the git change totals map by workspace id. */
export function useWorkspaceGitChangeTotalsByWorkspaceId() {
  return gitProjectionStore((state) => state.gitChangeTotalsByWorkspaceId);
}
