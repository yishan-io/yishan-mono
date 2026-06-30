import { YStack } from "tamagui";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { TransientNoticePill } from "@/components/ui/TransientNoticePill";
import { useActionCompletionNotice } from "@/components/ui/useActionCompletionNotice";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { WorkspacePullRequestsTabModel } from "../view-model/useWorkspacePullRequestsTabModel";
import { WorkspacePullRequestCard } from "./WorkspacePullRequestCard";
import { WorkspacePullRequestCheckRow } from "./WorkspacePullRequestCheckRow";
import { WorkspacePullRequestDeploymentRow } from "./WorkspacePullRequestDeploymentRow";
import { WorkspacePullRequestSectionHeader } from "./WorkspacePullRequestSectionHeader";

type WorkspacePullRequestsTabProps = {
  model: WorkspacePullRequestsTabModel;
};

export function WorkspacePullRequestsTab({ model }: WorkspacePullRequestsTabProps) {
  const { t } = useAppLanguage();
  const { handleAction: handleRefresh, showNotice: showRefreshNotice } = useActionCompletionNotice({
    hasError: model.refreshError,
    isRefreshing: model.refreshing,
    onAction: () => {
      void model.refetch();
    },
  });

  if (model.loading && !model.refreshing) {
    return <LoadingView label={t("shell.loadingPullRequests")} />;
  }

  if (model.error) {
    return <ErrorState onRetry={() => void model.refetch()} />;
  }

  if (model.empty || !model.latestPullRequest) {
    return <EmptyState title={t("shell.pullRequestsEmptyTitle")} message={t("shell.pullRequestsEmptyMessage")} />;
  }

  return (
    <YStack style={{ flex: 1, paddingBottom: 20 }}>
      {showRefreshNotice ? <TransientNoticePill label={t("shell.pullRequestStatusChecked")} /> : null}
      <WorkspacePullRequestSectionHeader
        disabled={model.refreshing}
        onRefresh={handleRefresh}
        refreshLabel={t("shell.pullRequestRefresh")}
        refreshingLabel={t("shell.pullRequestRefreshing")}
        title={t("shell.pullRequestsLatest")}
      />
      <WorkspacePullRequestCard onOpenPullRequest={model.onOpenPullRequest} pullRequest={model.latestPullRequest} />
      {model.currentPullRequest && model.checks.length > 0 ? (
        <>
          <WorkspacePullRequestSectionHeader title={t("shell.pullRequestChecks")} />
          <YStack gap="$2" style={{ paddingBottom: 16, paddingHorizontal: 16 }}>
            {model.checks.map((check) => (
              <WorkspacePullRequestCheckRow
                key={`${check.workflow ?? ""}:${check.name}`}
                check={check}
                onOpenPullRequest={model.onOpenPullRequest}
              />
            ))}
          </YStack>
        </>
      ) : null}
      {model.currentPullRequest && model.deployments.length > 0 ? (
        <>
          <WorkspacePullRequestSectionHeader title={t("shell.pullRequestDeployments")} />
          <YStack gap="$2" style={{ paddingBottom: 16, paddingHorizontal: 16 }}>
            {model.deployments.map((deployment) => (
              <WorkspacePullRequestDeploymentRow
                key={deployment.id}
                deployment={deployment}
                onOpenPullRequest={model.onOpenPullRequest}
              />
            ))}
          </YStack>
        </>
      ) : null}
      {model.historicalPullRequests.length > 0 ? (
        <>
          <WorkspacePullRequestSectionHeader title={t("shell.pullRequestsHistory")} />
          <YStack>
            {model.historicalPullRequests.map((pullRequest) => (
              <WorkspacePullRequestCard
                key={pullRequest.id}
                compact
                onOpenPullRequest={model.onOpenPullRequest}
                pullRequest={pullRequest}
              />
            ))}
          </YStack>
        </>
      ) : null}
    </YStack>
  );
}
