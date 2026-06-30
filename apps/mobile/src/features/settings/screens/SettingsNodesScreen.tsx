import { YStack } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { NodesListCard } from "@/features/nodes/components/NodesListCard";
import { useSettingsNodesScreenModel } from "@/features/settings/hooks/useSettingsNodesScreenModel";

export function SettingsNodesScreen() {
  const model = useSettingsNodesScreenModel();

  if (!model.organizationId) {
    return (
      <ScreenScaffold
        title={model.t("settings.nodesTitle")}
        onBack={model.onBack}
        scrollable={false}
        titleVariant="compact"
      >
        <YStack style={{ flex: 1, gap: 16, paddingBottom: 24, paddingTop: 12 }}>
          <ErrorState onRetry={model.onBack} />
        </YStack>
      </ScreenScaffold>
    );
  }

  if (model.nodesQuery.isLoading) {
    return <LoadingView label={model.t("shell.loadingNodes")} />;
  }

  if (model.nodesQuery.isError) {
    return <ErrorState onRetry={() => model.nodesQuery.refetch()} />;
  }

  return (
    <ScreenScaffold
      title={model.t("settings.nodesTitle")}
      subtitle={model.organizationName || undefined}
      onBack={model.onBack}
      scrollable={false}
      titleVariant="compact"
    >
      <YStack style={{ flex: 1, gap: 16, paddingBottom: 24, paddingTop: 12 }}>
        <NodesListCard nodes={model.nodesQuery.data ?? []} />
      </YStack>
    </ScreenScaffold>
  );
}
