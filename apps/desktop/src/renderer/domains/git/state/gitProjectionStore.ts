import type { WorkspaceGitChangeTotals } from "@renderer/domains/workspace";
/**
 * Git feature projection Store (desktop6-adjust.md W4).
 *
 * Owns Git and pull-request projections for open workspaces: live PR, latest
 * PR summary, current branch, git change counts/totals, and the git refresh
 * version per worktree path. Previously these lived in the Workspace feature
 * (`workspaceProjectionStore`); Git owns Git polling and projection updates.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { GitPullRequest, GitPullRequestSummary } from "../pull-request/gitPullRequestTypes";


export type GitProjectionStoreState = {
  pullRequestByWorkspaceId: Record<string, GitPullRequest | undefined>;
  latestPullRequestByWorkspaceId: Record<string, GitPullRequestSummary | undefined>;
  currentBranchByWorkspaceId: Record<string, string>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  gitRefreshVersionByWorktreePath: Record<string, number>;
  setWorkspacePullRequest: (workspaceId: string, pullRequest?: GitPullRequest) => void;
  setWorkspaceCurrentBranch: (workspaceId: string, branch: string) => void;
  setWorkspaceGitChangesCount: (workspaceId: string, count: number) => void;
  setWorkspaceGitChangeTotals: (workspaceId: string, totals: WorkspaceGitChangeTotals) => void;
  incrementGitRefreshVersion: (workspaceWorktreePath: string) => void;
  pruneForWorkspaces: (workspaceIdSet: ReadonlySet<string>) => void;
  setAll: (input: {
    pullRequestByWorkspaceId: Record<string, GitPullRequest | undefined>;
    latestPullRequestByWorkspaceId: Record<string, GitPullRequestSummary | undefined>;
    gitChangesCountByWorkspaceId: Record<string, number>;
    gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  }) => void;
};

/** Stores workspace-scoped Git projections (PR, branch, git totals, refresh versions). */
export const gitProjectionStore = create<GitProjectionStoreState>()(
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

