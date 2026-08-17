/**
 * Workspace projection store — owns PR/branch/git-totals/refresh-version
 * projections for open workspaces.
 *
 * Phase 3: projections leave workspaceStore entity state. Holds view-model
 * types only (WorkspacePullRequestViewModel, feature-owned status); transport
 * DTOs are mapped in the model layer.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { WorkspacePullRequestSummary } from "../../../api/types";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import type { WorkspaceGitChangeTotals } from "../model/workspaceTypes";

type ProjectionStoreState = {
  pullRequestByWorkspaceId: Record<string, DaemonWorkspacePullRequest | undefined>;
  latestPullRequestByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined>;
  currentBranchByWorkspaceId: Record<string, string>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  gitRefreshVersionByWorktreePath: Record<string, number>;
  setWorkspacePullRequest: (workspaceId: string, pullRequest?: DaemonWorkspacePullRequest) => void;
  setWorkspaceCurrentBranch: (workspaceId: string, branch: string) => void;
  setWorkspaceGitChangesCount: (workspaceId: string, count: number) => void;
  setWorkspaceGitChangeTotals: (workspaceId: string, totals: WorkspaceGitChangeTotals) => void;
  incrementGitRefreshVersion: (workspaceWorktreePath: string) => void;
  pruneForWorkspaces: (workspaceIdSet: ReadonlySet<string>) => void;
  setAll: (input: {
    pullRequestByWorkspaceId: Record<string, DaemonWorkspacePullRequest | undefined>;
    latestPullRequestByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined>;
    gitChangesCountByWorkspaceId: Record<string, number>;
    gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  }) => void;
};

/** Stores workspace-scoped projections (PR, branch, git totals, refresh versions). */
export const workspaceProjectionStore = create<ProjectionStoreState>()(
  immer((set) => ({
    pullRequestByWorkspaceId: {},
    latestPullRequestByWorkspaceId: {},
    currentBranchByWorkspaceId: {},
    gitChangesCountByWorkspaceId: {},
    gitChangeTotalsByWorkspaceId: {},
    gitRefreshVersionByWorktreePath: {},

    setWorkspacePullRequest: (workspaceId, pullRequest) => {
      set((state) => {
        state.pullRequestByWorkspaceId[workspaceId] = pullRequest;
      });
    },
    setWorkspaceCurrentBranch: (workspaceId, branch) => {
      set((state) => {
        state.currentBranchByWorkspaceId[workspaceId] = branch;
      });
    },
    setWorkspaceGitChangesCount: (workspaceId, count) => {
      set((state) => {
        state.gitChangesCountByWorkspaceId[workspaceId] = count;
      });
    },
    setWorkspaceGitChangeTotals: (workspaceId, totals) => {
      set((state) => {
        state.gitChangeTotalsByWorkspaceId[workspaceId] = totals;
      });
    },
    incrementGitRefreshVersion: (workspaceWorktreePath) => {
      const normalizedPath = workspaceWorktreePath.trim();
      if (!normalizedPath) {
        return;
      }
      set((state) => {
        state.gitRefreshVersionByWorktreePath[normalizedPath] =
          (state.gitRefreshVersionByWorktreePath[normalizedPath] ?? 0) + 1;
      });
    },
    pruneForWorkspaces: (workspaceIdSet) => {
      set((state) => {
        for (const workspaceId of Object.keys(state.pullRequestByWorkspaceId)) {
          if (!workspaceIdSet.has(workspaceId)) {
            delete state.pullRequestByWorkspaceId[workspaceId];
          }
        }
        for (const workspaceId of Object.keys(state.latestPullRequestByWorkspaceId)) {
          if (!workspaceIdSet.has(workspaceId)) {
            delete state.latestPullRequestByWorkspaceId[workspaceId];
          }
        }
        for (const workspaceId of Object.keys(state.gitChangesCountByWorkspaceId)) {
          if (!workspaceIdSet.has(workspaceId)) {
            delete state.gitChangesCountByWorkspaceId[workspaceId];
          }
        }
        for (const workspaceId of Object.keys(state.gitChangeTotalsByWorkspaceId)) {
          if (!workspaceIdSet.has(workspaceId)) {
            delete state.gitChangeTotalsByWorkspaceId[workspaceId];
          }
        }
      });
    },
    setAll: (input) => {
      set((state) => {
        state.pullRequestByWorkspaceId = input.pullRequestByWorkspaceId;
        state.latestPullRequestByWorkspaceId = input.latestPullRequestByWorkspaceId;
        state.gitChangesCountByWorkspaceId = input.gitChangesCountByWorkspaceId;
        state.gitChangeTotalsByWorkspaceId = input.gitChangeTotalsByWorkspaceId;
      });
    },
  })),
);
