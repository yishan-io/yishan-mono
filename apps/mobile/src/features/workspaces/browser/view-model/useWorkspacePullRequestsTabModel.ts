import { useMemo } from "react";

import { useWorkspaceCurrentPullRequestQuery } from "@/features/workspaces/queries/useWorkspaceCurrentPullRequestQuery";
import { useWorkspacePullRequestsQuery } from "@/features/workspaces/queries/useWorkspacePullRequestsQuery";
import type {
  WorkspaceCurrentPullRequest,
  WorkspaceCurrentPullRequestCheck,
  WorkspaceCurrentPullRequestDeployment,
  WorkspacePullRequestSummary,
} from "@/features/workspaces/workspaces.types";
import { useWorkspacePullRequestsCommands } from "../commands/useWorkspacePullRequestsCommands";

type UseWorkspacePullRequestsTabModelOptions = {
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspacePullRequestCardState = "approved" | "closed" | "draft" | "merged" | "open";

export type WorkspacePullRequestCardItem = {
  id: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: WorkspacePullRequestCardState;
  dateKind: "detectedAt" | "updatedAt" | null;
  dateValue: string | null;
};

export type WorkspacePullRequestsTabModel = {
  currentPullRequest: WorkspaceCurrentPullRequest | null;
  empty: boolean;
  error: boolean;
  historicalPullRequests: WorkspacePullRequestCardItem[];
  latestPullRequest: WorkspacePullRequestCardItem | null;
  loading: boolean;
  onOpenPullRequest: (url: string | null) => Promise<void>;
  refetch: () => Promise<void>;
  refreshing: boolean;
  checks: WorkspaceCurrentPullRequestCheck[];
  deployments: WorkspaceCurrentPullRequestDeployment[];
};

function readLivePullRequestState(pullRequest: WorkspaceCurrentPullRequest): WorkspacePullRequestCardState {
  const status = (pullRequest.status ?? "").toLowerCase();
  const reviewDecision = (pullRequest.reviewDecision ?? "").toLowerCase();

  if (pullRequest.complete || status === "merged") {
    return "merged";
  }

  if (pullRequest.isDraft || status === "draft") {
    return "draft";
  }

  if (status === "closed") {
    return "closed";
  }

  if (reviewDecision === "approved") {
    return "approved";
  }

  return "open";
}

function toHistoryCardItem(pullRequest: WorkspacePullRequestSummary): WorkspacePullRequestCardItem {
  return {
    baseBranch: pullRequest.baseBranch,
    branch: pullRequest.branch,
    dateKind: "detectedAt",
    dateValue: pullRequest.detectedAt,
    id: pullRequest.id,
    prId: pullRequest.prId,
    state: pullRequest.state,
    title: pullRequest.title,
    url: pullRequest.url,
  };
}

function toLiveCardItem(pullRequest: WorkspaceCurrentPullRequest): WorkspacePullRequestCardItem {
  return {
    baseBranch: pullRequest.baseBranch ?? null,
    branch: pullRequest.branch ?? null,
    dateKind: pullRequest.updatedAt ? "updatedAt" : null,
    dateValue: pullRequest.updatedAt ?? null,
    id: `live-${pullRequest.number}`,
    prId: String(pullRequest.number),
    state: readLivePullRequestState(pullRequest),
    title: pullRequest.title ?? null,
    url: pullRequest.url ?? null,
  };
}

export function useWorkspacePullRequestsTabModel({
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspacePullRequestsTabModelOptions): WorkspacePullRequestsTabModel {
  const enabled = organizationId.length > 0 && projectId.length > 0 && workspaceId.length > 0;
  const currentQuery = useWorkspaceCurrentPullRequestQuery(organizationId, projectId, workspaceId, { enabled });
  const historyQuery = useWorkspacePullRequestsQuery(organizationId, projectId, workspaceId, { enabled });
  const { openPullRequest } = useWorkspacePullRequestsCommands();

  const historicalPullRequests = historyQuery.data ?? [];
  const currentPullRequest = currentQuery.data ?? null;

  const bestOpenHistoryPullRequest = useMemo(
    () =>
      currentPullRequest ? null : (historicalPullRequests.find((pullRequest) => pullRequest.state === "open") ?? null),
    [currentPullRequest, historicalPullRequests],
  );

  const latestPullRequest = useMemo(() => {
    if (currentPullRequest) {
      return toLiveCardItem(currentPullRequest);
    }

    if (bestOpenHistoryPullRequest) {
      return toHistoryCardItem(bestOpenHistoryPullRequest);
    }

    const latestHistoricalPullRequest = historicalPullRequests[0] ?? null;
    return latestHistoricalPullRequest ? toHistoryCardItem(latestHistoricalPullRequest) : null;
  }, [bestOpenHistoryPullRequest, currentPullRequest, historicalPullRequests]);

  const historicalCards = useMemo(() => {
    const livePrId = currentPullRequest ? String(currentPullRequest.number) : null;

    return historicalPullRequests
      .filter((pullRequest) => {
        if (livePrId && pullRequest.prId === livePrId) {
          return false;
        }

        if (bestOpenHistoryPullRequest && pullRequest.id === bestOpenHistoryPullRequest.id) {
          return false;
        }

        return true;
      })
      .map((pullRequest) => toHistoryCardItem(pullRequest));
  }, [bestOpenHistoryPullRequest, currentPullRequest, historicalPullRequests]);

  const hasAnyPullRequest = latestPullRequest !== null || historicalCards.length > 0;
  const loading = !hasAnyPullRequest && (currentQuery.isLoading || historyQuery.isLoading);
  const error = !hasAnyPullRequest && historyQuery.isError;
  const checks = currentPullRequest?.checks ?? [];
  const deployments = currentPullRequest?.deployments ?? [];

  return {
    checks,
    currentPullRequest,
    deployments,
    empty: !loading && !error && !hasAnyPullRequest,
    error,
    historicalPullRequests: historicalCards,
    latestPullRequest,
    loading,
    onOpenPullRequest: openPullRequest,
    refetch: async () => {
      await Promise.all([currentQuery.refetch(), historyQuery.refetch()]);
    },
    refreshing: currentQuery.isFetching || historyQuery.isFetching,
  };
}
