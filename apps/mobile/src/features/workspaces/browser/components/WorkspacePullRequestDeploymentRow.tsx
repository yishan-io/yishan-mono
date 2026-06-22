import { ExternalLink } from "@tamagui/lucide-icons";
import { View } from "react-native";
import { Button, Paragraph, Text, XStack, YStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { WorkspacePullRequestsTabModel } from "../view-model/useWorkspacePullRequestsTabModel";

type WorkspacePullRequestDeploymentRowProps = {
  deployment: WorkspacePullRequestsTabModel["deployments"][number];
  onOpenPullRequest: (url: string | null) => Promise<void>;
};

export function WorkspacePullRequestDeploymentRow({
  deployment,
  onOpenPullRequest,
}: WorkspacePullRequestDeploymentRowProps) {
  const theme = useTheme();
  const { t } = useAppLanguage();
  const stateColor = getDeploymentStateColor(deployment.state, theme);

  return (
    <XStack gap="$3" style={{ alignItems: "center" }}>
      <View
        style={{
          backgroundColor: stateColor.background,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text fontSize="$2" fontWeight="700" style={{ color: stateColor.foreground }}>
          {deployment.state ?? "unknown"}
        </Text>
      </View>
      <YStack flex={1} style={{ minWidth: 0 }}>
        <Text fontSize="$4" fontWeight="600" numberOfLines={1}>
          {deployment.environment ?? "unknown"}
        </Text>
        {deployment.description ? (
          <Paragraph color="$gray10" numberOfLines={1} style={{ marginTop: 2 }}>
            {deployment.description}
          </Paragraph>
        ) : null}
      </YStack>
      {deployment.environmentUrl ? (
        <Button
          chromeless
          color="$color11"
          icon={ExternalLink}
          onPress={() => void onOpenPullRequest(deployment.environmentUrl ?? null)}
          size="$2"
        >
          {t("shell.pullRequestOpen")}
        </Button>
      ) : null}
    </XStack>
  );
}

function getDeploymentStateColor(state: string | undefined, theme: ReturnType<typeof useTheme>) {
  switch ((state ?? "").toLowerCase()) {
    case "success":
    case "active":
      return {
        background: theme.green3.val,
        foreground: theme.green11.val,
      };
    case "failure":
    case "error":
      return {
        background: theme.red3.val,
        foreground: theme.red11.val,
      };
    default:
      return {
        background: theme.gray3.val,
        foreground: theme.gray11.val,
      };
  }
}
