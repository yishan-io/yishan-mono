import { Check, CircleDashed, ExternalLink, X } from "@tamagui/lucide-icons";
import { View } from "react-native";
import { Button, Paragraph, Text, XStack, YStack } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { WorkspacePullRequestsTabModel } from "../view-model/useWorkspacePullRequestsTabModel";

type WorkspacePullRequestCheckRowProps = {
  check: WorkspacePullRequestsTabModel["checks"][number];
  onOpenPullRequest: (url: string | null) => Promise<void>;
};

export function WorkspacePullRequestCheckRow({ check, onOpenPullRequest }: WorkspacePullRequestCheckRowProps) {
  const { t } = useAppLanguage();

  return (
    <XStack gap="$3" style={{ alignItems: "center" }}>
      <View style={{ width: 18, alignItems: "center" }}>{renderCheckStateIcon(check.state)}</View>
      <YStack flex={1} style={{ minWidth: 0 }}>
        <Text fontSize="$4" fontWeight="600" numberOfLines={1}>
          {check.workflow ? `${check.workflow} / ${check.name}` : check.name}
        </Text>
        {check.description ? (
          <Paragraph color="$gray10" numberOfLines={1} style={{ marginTop: 2 }}>
            {check.description}
          </Paragraph>
        ) : null}
      </YStack>
      {check.url ? (
        <Button
          chromeless
          color="$color11"
          icon={ExternalLink}
          onPress={() => void onOpenPullRequest(check.url ?? null)}
          size="$2"
        >
          {t("shell.pullRequestOpen")}
        </Button>
      ) : null}
    </XStack>
  );
}

function renderCheckStateIcon(state: string) {
  const normalizedState = state.toUpperCase();

  if (normalizedState === "SUCCESS") {
    return <Check color="$green11" size={16} />;
  }

  if (
    normalizedState === "FAILURE" ||
    normalizedState === "TIMED_OUT" ||
    normalizedState === "CANCELLED" ||
    normalizedState === "ACTION_REQUIRED"
  ) {
    return <X color="$red11" size={16} />;
  }

  return <CircleDashed color="$gray10" size={16} />;
}
