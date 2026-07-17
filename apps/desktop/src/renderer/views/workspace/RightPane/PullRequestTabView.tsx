import { Box, Stack } from "@mui/material";
import { PaneLoadingBar } from "@renderer/components/PaneLoadingBar";
import { useCommands } from "@renderer/hooks/useCommands";
import { workspaceStore } from "@renderer/store/workspaceStore";
import { useMemo, useState } from "react";
import PullRequestChecksSection from "./pullRequestTab/PullRequestChecksSection";
import PullRequestDeploymentsSection from "./pullRequestTab/PullRequestDeploymentsSection";
import PullRequestEmptyState from "./pullRequestTab/PullRequestEmptyState";
import PullRequestHeaderSection from "./pullRequestTab/PullRequestHeaderSection";
import PullRequestHistorySection from "./pullRequestTab/PullRequestHistorySection";
import { type MergeMethod, derivePullRequestTabState } from "./pullRequestTab/pullRequestTabHelpers";
import { usePullRequestTabActions } from "./pullRequestTab/usePullRequestTabActions";
import { useWorkspacePullRequestState } from "./useWorkspacePullRequestState";

/** Renders pull request, checks, and deployment details for the selected workspace. */
export function PullRequestTabView({ active = true }: { active?: boolean }) {
  const { refreshWorkspacePullRequest } = useCommands();
  const { selectedWorkspaceId, pullRequest, historicalPullRequests, isLoading } = useWorkspacePullRequestState(active);
  const worktreePath = workspaceStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath,
  );

  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("merge");
  const derivedState = useMemo(
    () => derivePullRequestTabState(pullRequest, historicalPullRequests),
    [historicalPullRequests, pullRequest],
  );

  const actions = usePullRequestTabActions({
    hasLivePr: derivedState.hasLivePr,
    mergeMethod,
    prBaseBranch: derivedState.prBaseBranch,
    prBranch: derivedState.prBranch,
    prNumber: derivedState.prNumber,
    prTitle: derivedState.prTitle,
    prUrl: derivedState.prUrl,
    pullRequest,
    refreshWorkspacePullRequest,
    selectedWorkspaceId,
    worktreePath,
  });

  if (isLoading && derivedState.isEmpty) {
    return <PaneLoadingBar />;
  }

  if (derivedState.isEmpty) {
    return (
      <PullRequestEmptyState
        actionError={actions.actionError}
        isRefreshing={actions.isRefreshing}
        onRefresh={actions.handleRefresh}
        worktreePath={worktreePath}
      />
    );
  }

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", px: 2, py: 1.5 }}>
      <Stack spacing={2}>
        {pullRequest || derivedState.bestOpenHistoryPr ? (
          <>
            <PullRequestHeaderSection
              actionError={actions.actionError}
              actions={{ ...actions, setMergeMethod }}
              hasLivePr={derivedState.hasLivePr}
              liveStatus={derivedState.liveStatus}
              mergeEnabled={derivedState.mergeEnabled}
              mergeMethod={mergeMethod}
              prBaseBranch={derivedState.prBaseBranch}
              prBranch={derivedState.prBranch}
              prNumber={derivedState.prNumber}
              prOpen={derivedState.prOpen}
              prTitle={derivedState.prTitle}
              prUrl={derivedState.prUrl}
              worktreePath={worktreePath}
            />
            <PullRequestChecksSection checks={derivedState.checks} />
            <PullRequestDeploymentsSection deployments={derivedState.deployments} />
          </>
        ) : null}

        {derivedState.hasHistory ? (
          <PullRequestHistorySection
            pastPullRequests={derivedState.pastPullRequests}
            showTopDivider={Boolean(pullRequest || derivedState.bestOpenHistoryPr)}
          />
        ) : null}
      </Stack>
    </Box>
  );
}
