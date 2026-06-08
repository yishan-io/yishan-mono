import {
  applyCreatedWorkspaceState,
  applyDeletedWorkspaceState,
  applyRenamedWorkspaceBranchState,
  applyRenamedWorkspaceState,
} from "../../helpers/workspaceHelpers";
import type { DaemonWorkspacePullRequest } from "../../rpc/daemonTypes";
import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "../types";

type WorkspaceActions = Pick<
  WorkspaceStoreActions,
  | "addWorkspace"
  | "removeWorkspace"
  | "renameWorkspace"
  | "renameWorkspaceBranch"
  | "reorderWorkspace"
  | "setWorkspaceGitChangesCount"
  | "setWorkspaceGitChangeTotals"
  | "setWorkspacePullRequest"
  | "setWorkspaceCurrentBranch"
  | "incrementGitRefreshVersion"
>;

/** Creates, renames, and deletes workspaces while keeping selection state in sync. */
export function createWorkspaceActions(set: WorkspaceStoreSetState, _get: WorkspaceStoreGetState): WorkspaceActions {
  const resolveProjectId = (input: { projectId?: string; repoId?: string }): string => {
    return input.projectId ?? input.repoId ?? "";
  };

  return {
    addWorkspace: ({
      organizationId,
      projectId,
      repoId,
      name,
      sourceBranch,
      branch,
      worktreePath,
      workspaceId,
      nodeId,
    }) => {
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
            nodeId,
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
    reorderWorkspace: ({ draggedWorkspaceId, targetWorkspaceId, position }) => {
      if (!draggedWorkspaceId || !targetWorkspaceId || draggedWorkspaceId === targetWorkspaceId) {
        return;
      }

      set((state) => {
        const draggedIndex = state.workspaces.findIndex((workspace) => workspace.id === draggedWorkspaceId);
        const targetIndex = state.workspaces.findIndex((workspace) => workspace.id === targetWorkspaceId);
        if (draggedIndex < 0 || targetIndex < 0) {
          return;
        }

        const draggedWorkspace = state.workspaces[draggedIndex];
        const targetWorkspace = state.workspaces[targetIndex];
        if (!draggedWorkspace || !targetWorkspace) {
          return;
        }

        const draggedProjectId = resolveProjectId({
          projectId: draggedWorkspace.projectId,
          repoId: draggedWorkspace.repoId,
        });
        const targetProjectId = resolveProjectId({
          projectId: targetWorkspace.projectId,
          repoId: targetWorkspace.repoId,
        });
        const draggedNodeId = draggedWorkspace.nodeId?.trim() ?? "";
        const targetNodeId = targetWorkspace.nodeId?.trim() ?? "";
        if (
          !draggedProjectId ||
          !targetProjectId ||
          draggedProjectId !== targetProjectId ||
          draggedNodeId !== targetNodeId
        ) {
          return;
        }

        const [movedWorkspace] = state.workspaces.splice(draggedIndex, 1);
        if (!movedWorkspace) {
          return;
        }

        const nextTargetIndex = state.workspaces.findIndex((workspace) => workspace.id === targetWorkspaceId);
        if (nextTargetIndex < 0) {
          state.workspaces.splice(draggedIndex, 0, movedWorkspace);
          return;
        }

        const insertionIndex = position === "after" ? nextTargetIndex + 1 : nextTargetIndex;
        state.workspaces.splice(insertionIndex, 0, movedWorkspace);
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
    setWorkspaceCurrentBranch: (workspaceId, branch) => {
      if (!workspaceId) {
        return;
      }

      set((state) => {
        state.currentBranchByWorkspaceId[workspaceId] = branch;
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
