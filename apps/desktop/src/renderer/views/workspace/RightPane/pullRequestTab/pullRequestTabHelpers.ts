import type { WorkspacePullRequestRecord } from "@renderer/api/types";
import { livePrStatus } from "@renderer/helpers/pullRequestUtils";
import type { DaemonWorkspacePullRequest, DaemonWorkspacePullRequestCheck } from "@renderer/rpc/daemonTypes";

export type MergeMethod = "merge" | "squash" | "rebase";

export type PullRequestTabDerivedState = {
  hasLivePr: boolean;
  liveStatus: string | undefined;
  checks: DaemonWorkspacePullRequestCheck[];
  deployments: NonNullable<DaemonWorkspacePullRequest["deployments"]>;
  bestOpenHistoryPr: WorkspacePullRequestRecord | undefined;
  pastPullRequests: WorkspacePullRequestRecord[];
  hasHistory: boolean;
  isEmpty: boolean;
  prNumber: number | undefined;
  prTitle: string | undefined;
  prUrl: string | undefined;
  prBranch: string | undefined;
  prBaseBranch: string | undefined;
  mergeEnabled: boolean;
  prOpen: boolean;
};

const failingCheckStates = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"]);

/** Returns whether a pull request check should block merge actions. */
export function isFailingCheck(check: DaemonWorkspacePullRequestCheck): boolean {
  return failingCheckStates.has(check.state.toUpperCase());
}

/** Returns whether a live pull request can be merged from the current view. */
export function canMergePullRequest(pr: DaemonWorkspacePullRequest): boolean {
  if (livePrStatus(pr) !== "open") {
    return false;
  }

  const checks = pr.checks ?? [];
  if (checks.length === 0) {
    return true;
  }

  return !checks.some(isFailingCheck);
}

/** Derives the current pull request tab display state from live and historical data. */
export function derivePullRequestTabState(
  pullRequest: DaemonWorkspacePullRequest | undefined,
  historicalPullRequests: WorkspacePullRequestRecord[] | undefined,
): PullRequestTabDerivedState {
  const hasLivePr = Boolean(pullRequest);
  const liveStatus = pullRequest ? livePrStatus(pullRequest) : undefined;
  const checks = pullRequest?.checks ?? [];
  const deployments = pullRequest?.deployments ?? [];
  const livePrId = pullRequest?.number != null ? String(pullRequest.number) : null;
  const history = historicalPullRequests ?? [];
  const bestOpenHistoryPr = !hasLivePr ? history.find((pr) => pr.state === "open") : undefined;
  const pastPullRequests = history.filter(
    (pr) => pr.prId !== livePrId && (!bestOpenHistoryPr || pr.id !== bestOpenHistoryPr.id),
  );
  const hasHistory = pastPullRequests.length > 0;
  const isEmpty = !hasLivePr && !bestOpenHistoryPr && !hasHistory;
  const prNumber = pullRequest?.number ?? (bestOpenHistoryPr ? Number(bestOpenHistoryPr.prId) : undefined);
  const prTitle = pullRequest?.title ?? bestOpenHistoryPr?.title ?? undefined;
  const prUrl = pullRequest?.url ?? bestOpenHistoryPr?.url ?? undefined;
  const prBranch = pullRequest?.branch ?? bestOpenHistoryPr?.branch ?? undefined;
  const prBaseBranch = pullRequest?.baseBranch ?? bestOpenHistoryPr?.baseBranch ?? undefined;
  const mergeEnabled = pullRequest ? canMergePullRequest(pullRequest) : true;
  const prOpen =
    hasLivePr && pullRequest ? !pullRequest.complete && liveStatus !== "closed" : Boolean(bestOpenHistoryPr);

  return {
    hasLivePr,
    liveStatus,
    checks,
    deployments,
    bestOpenHistoryPr,
    pastPullRequests,
    hasHistory,
    isEmpty,
    prNumber,
    prTitle,
    prUrl,
    prBranch,
    prBaseBranch,
    mergeEnabled,
    prOpen,
  };
}
