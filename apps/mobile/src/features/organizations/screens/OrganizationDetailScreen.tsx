import { YStack } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { OrganizationNodesSection } from "@/features/organizations/components/OrganizationNodesSection";
import { OrganizationOverviewSection } from "@/features/organizations/components/OrganizationOverviewSection";
import { useOrganizationDetailModel } from "@/features/organizations/hooks/useOrganizationDetailModel";

export function OrganizationDetailScreen() {
  const model = useOrganizationDetailModel();

  if (
    model.queries.organizationsQuery.isLoading ||
    model.queries.projectsQuery.isLoading ||
    model.queries.nodesQuery.isLoading
  ) {
    return <LoadingView label={model.t("settings.loading")} />;
  }

  if (
    model.queries.organizationsQuery.isError ||
    model.queries.projectsQuery.isError ||
    model.queries.nodesQuery.isError
  ) {
    return <ErrorState onRetry={model.onRetry} />;
  }

  if (!model.organization) {
    return <ErrorState onRetry={model.onBack} />;
  }

  return (
    <ScreenScaffold
      onBack={model.onBack}
      scrollable={false}
      subtitle={model.t("shell.organizationFallbackTitle")}
      title={model.organization.name}
    >
      <YStack style={{ flex: 1, gap: 20, paddingBottom: 24, paddingTop: 12 }}>
        <OrganizationOverviewSection metrics={model.metrics} title={model.t("shell.overview")} />
        <OrganizationNodesSection
          description={model.t("settings.nodesDescriptionWithOrg", { organization: model.organization.name })}
          nodes={model.nodes}
          title={model.t("settings.nodesTitle")}
        />
      </YStack>
    </ScreenScaffold>
  );
}
