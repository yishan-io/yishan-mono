
import { useEffect, useRef, useState } from "react";
import { listPullRequestHistory, refreshWorkspacePullRequest } from "../../commands/gitProjectionCommands";
import { gitProjectionStore } from "../../state/gitProjectionStore";
import type { WorkspacePullRequestRecord } from "../../api/workspacePullRequestApi";
import type { GitPullRequest } from "../../pull-request/gitPullRequestTypes";

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";

export type WorkspacePullRequestState = {
  selectedWorkspaceId: string;
  /** The live PR from the daemon (current branch, real-time). */
  pullRequest: GitPullRequest | undefined;
  /** Historical PRs from the api-service, ordered by detected_at desc. */
  historicalPullRequests: WorkspacePullRequestRecord[];
  isLoading: boolean;
};

/** Returns live and historical pull request state for the currently selected workspace. */
export function useWorkspacePullRequestState(enabled = true): WorkspacePullRequestState {
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const pullRequest = gitProjectionStore((state) => state.pullRequestByWorkspaceId)[selectedWorkspaceId];
  const workspace = workspaceStore((state) => state.workspaces).find((w) => w.id === selectedWorkspaceId);

  const [historicalPullRequests, setHistoricalPullRequests] = useState<WorkspacePullRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const orgId = workspace?.organizationId;
  const projectId = workspace?.projectId;
  const worktreePath = workspace?.worktreePath;

  // Track whether we've already attempted an on-demand daemon refresh for this workspace
  // to avoid repeated calls while the tab stays open.
  const daemonRefreshAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !selectedWorkspaceId || !orgId || !projectId) {
      setHistoricalPullRequests([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    listPullRequestHistory(orgId, projectId, selectedWorkspaceId)
      .then((records) => {
        if (!cancelled) {
          setHistoricalPullRequests(records);
        }
      })
      .catch(() => {
        // Non-fatal — historical PRs are best-effort display
        if (!cancelled) {
          setHistoricalPullRequests([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, selectedWorkspaceId, orgId, projectId]);

  // When the tab is active and there is no live daemon PR yet, trigger an immediate
  // daemon PR refresh for this workspace so the current branch is re-checked without
  // waiting for the polling interval.
  useEffect(() => {
    if (
      !enabled ||
      !selectedWorkspaceId ||
      !worktreePath ||
      pullRequest || // Already have a live PR — skip
      daemonRefreshAttemptedRef.current === selectedWorkspaceId // Already tried for this workspace
    ) {
      return;
    }

    // Mark as attempted immediately so concurrent renders don't fire duplicates.
    daemonRefreshAttemptedRef.current = selectedWorkspaceId;

    refreshWorkspacePullRequest(selectedWorkspaceId).catch(() => {
      // Best-effort — daemon refresh failures are non-fatal.
    });
  }, [enabled, selectedWorkspaceId, worktreePath, pullRequest]);

  // Reset the daemon refresh tracker when the workspace changes so a new workspace
  // gets its own on-demand check.
  useEffect(() => {
    void selectedWorkspaceId;
    daemonRefreshAttemptedRef.current = null;
  }, [selectedWorkspaceId]);

  return {
    selectedWorkspaceId,
    pullRequest,
    historicalPullRequests,
    isLoading,
  };
}
