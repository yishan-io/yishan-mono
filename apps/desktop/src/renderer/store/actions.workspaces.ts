import {
  applyCreatedWorkspaceState,
  applyDeletedWorkspaceState,
  applyRenamedWorkspaceBranchState,
  applyRenamedWorkspaceState,
} from "../helpers/workspaceHelpers";
import type { DaemonWorkspacePullRequest } from "../rpc/daemonTypes";
import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "./types";

type WorkspaceActions = Pick<
  WorkspaceStoreActions,
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "setWorkspaceGitChangesCount"
  | "setWorkspaceGitChangeTotals"
  | "setWorkspacePullRequest"
  | "incrementGitRefreshVersion"
>;

/** Creates, renames, and deletes workspaces while keeping selection state in sync. */
export function createWorkspaceActions(set: WorkspaceStoreSetState, _get: WorkspaceStoreGetState): WorkspaceActions {
  const resolveProjectId = (input: { projectId?: string; repoId?: string }): string => {
    return input.projectId ?? input.repoId ?? "";
  };

  return {
    addWorkspace: ({ organizationId, projectId, repoId, name, sourceBranch, branch, worktreePath, workspaceId }) => {
      if (!workspaceId) {
        return;
      }

      const resolvedProjectId = resolveProjectId({ projectId, repoId });
      if (!resolvedProjectId) {
        return;
      }

      set((state) => {
        applyCreatedWorkspaceState(state, {
          projectId: resolvedProjectId,
          normalizedName: name,
          normalizedBranch: branch,
          backendWorkspace: {
            workspaceId,
            organizationId,
            name,
            sourceBranch,
            branch,
            worktreePath: worktreePath ?? "",
          },
        });
      });
    },
    removeWorkspace: ({ projectId, repoId, workspaceId }) => {
      const resolvedProjectId = resolveProjectId({ projectId, repoId });
      if (!resolvedProjectId || !workspaceId) {
        return;
      }

      set((state) => {
        applyDeletedWorkspaceState(state, {
          projectId: resolvedProjectId,
          workspaceId,
        });
      });
    },
    renameWorkspace: ({ projectId, repoId, workspaceId, name }) => {
      const normalizedName = name.trim();
      const resolvedProjectId = resolveProjectId({ projectId, repoId });
      if (!resolvedProjectId || !workspaceId || !normalizedName) {
        return;
      }

      set((state) => {
        applyRenamedWorkspaceState(state, {
          projectId: resolvedProjectId,
          workspaceId,
          normalizedName,
        });
      });
    },
    renameWorkspaceBranch: ({ projectId, repoId, workspaceId, branch }) => {
      const normalizedBranch = branch.trim();
      const resolvedProjectId = resolveProjectId({ projectId, repoId });
      if (!resolvedProjectId || !workspaceId || !normalizedBranch) {
        return;
      }

      set((state) => {
        applyRenamedWorkspaceBranchState(state, {
          projectId: resolvedProjectId,
          workspaceId,
          normalizedBranch,
        });
      });
    },
    setWorkspaceGitChangesCount: (workspaceId, count) => {
      if (!workspaceId) {
        return;
      }

      set((state) => {
        state.gitChangesCountByWorkspaceId[workspaceId] = count;
      });
    },
    setWorkspaceGitChangeTotals: (workspaceId, totals) => {
      if (!workspaceId) {
        return;
      }

      set((state) => {
        state.gitChangeTotalsByWorkspaceId[workspaceId] = {
          additions: Math.max(0, totals.additions),
          deletions: Math.max(0, totals.deletions),
        };
      });
    },
    setWorkspacePullRequest: (workspaceId, pullRequest?: DaemonWorkspacePullRequest) => {
      if (!workspaceId) {
        return;
      }

      set((state) => {
        state.pullRequestByWorkspaceId[workspaceId] = pullRequest;
      });
    },
    incrementGitRefreshVersion: (workspaceWorktreePath) => {
      const normalizedWorkspaceWorktreePath = workspaceWorktreePath.trim();
      if (!normalizedWorkspaceWorktreePath) {
        return;
      }

      set((state) => {
        state.gitRefreshVersionByWorktreePath[normalizedWorkspaceWorktreePath] =
          (state.gitRefreshVersionByWorktreePath[normalizedWorkspaceWorktreePath] ?? 0) + 1;
      });
    },
  };
}
