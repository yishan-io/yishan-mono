import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { WorkspacePullRequestRecord } from "../../../api/types";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { workspaceStore } from "../../../store/workspaceStore";

export type WorkspacePullRequestState = {
  selectedWorkspaceId: string;
  /** The live PR from the daemon (current branch, real-time). */
  pullRequest: import("../../../rpc/daemonTypes").DaemonWorkspacePullRequest | undefined;
  /** Historical PRs from the api-service, ordered by detected_at desc. */
  historicalPullRequests: WorkspacePullRequestRecord[];
  isLoading: boolean;
};

/** Returns live and historical pull request state for the currently selected workspace. */
export function useWorkspacePullRequestState(enabled = true): WorkspacePullRequestState {
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const pullRequest = workspaceStore((state) => state.pullRequestByWorkspaceId[state.selectedWorkspaceId]);
  const workspace = workspaceStore((state) =>
    state.workspaces.find((w) => w.id === state.selectedWorkspaceId),
  );

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

    api.workspacePullRequest
      .list(orgId, projectId, selectedWorkspaceId)
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

    let cancelled = false;

    getDaemonClient()
      .then((client) => client.workspace.refreshPullRequest({ workspaceId: selectedWorkspaceId, workspaceWorktreePath: worktreePath }))
      .then((daemonWorkspace) => {
        if (!cancelled && daemonWorkspace.pullRequest) {
          workspaceStore.getState().setWorkspacePullRequest(selectedWorkspaceId, daemonWorkspace.pullRequest);
        }
      })
      .catch(() => {
        // Best-effort — daemon refresh failures are non-fatal.
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, selectedWorkspaceId, worktreePath, orgId, projectId, pullRequest]);

  // Reset the daemon refresh tracker when the workspace changes so a new workspace
  // gets its own on-demand check.
  useEffect(() => {
    daemonRefreshAttemptedRef.current = null;
  }, [selectedWorkspaceId]);

  return {
    selectedWorkspaceId,
    pullRequest,
    historicalPullRequests,
    isLoading,
  };
}
