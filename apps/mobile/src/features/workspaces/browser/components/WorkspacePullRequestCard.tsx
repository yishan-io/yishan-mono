import { GitPullRequest } from "@tamagui/lucide-icons";
import { View } from "react-native";
import { Button, Paragraph, Text, XStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type {
  WorkspacePullRequestCardItem,
  WorkspacePullRequestCardState,
} from "../view-model/useWorkspacePullRequestsTabModel";

type WorkspacePullRequestCardProps = {
  compact?: boolean;
  onOpenPullRequest: (url: string | null) => Promise<void>;
  pullRequest: WorkspacePullRequestCardItem;
};

export function WorkspacePullRequestCard({
  compact = false,
  onOpenPullRequest,
  pullRequest,
}: WorkspacePullRequestCardProps) {
  const theme = useTheme();
  const { t } = useAppLanguage();
  const palette = getStatePalette(pullRequest.state, theme);
  const branchSummary =
    pullRequest.branch && pullRequest.baseBranch
      ? `${pullRequest.branch} -> ${pullRequest.baseBranch}`
      : pullRequest.branch || pullRequest.baseBranch || null;
  const timestampLabel = pullRequest.dateValue ? formatDateLabel(pullRequest.dateValue) : null;

  return (
    <View
      style={{
        borderBottomColor: theme.gray4.val,
        borderBottomWidth: compact ? 1 : 0,
        marginHorizontal: compact ? 0 : 16,
        marginTop: compact ? 0 : 4,
        paddingBottom: 16,
        paddingHorizontal: 16,
        paddingTop: compact ? 14 : 16,
      }}
    >
      <XStack style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
        <GitPullRequest color="$color11" size={16} />
        <View
          style={{
            backgroundColor: palette.background,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text fontSize="$2" fontWeight="700" style={{ color: palette.foreground }}>
            {renderStateLabel(pullRequest.state, t)}
          </Text>
        </View>
        <Text color="$gray11" fontSize="$3" fontWeight="700">
          #{pullRequest.prId}
        </Text>
      </XStack>
      <Text fontSize={compact ? "$5" : "$6"} fontWeight="700">
        {pullRequest.title || t("shell.pullRequestUntitled")}
      </Text>
      {branchSummary ? (
        <Paragraph color="$gray11" style={{ marginTop: 8 }}>
          {branchSummary}
        </Paragraph>
      ) : null}
      {timestampLabel && pullRequest.dateKind ? (
        <Paragraph color="$gray10" style={{ marginTop: 8 }}>
          {pullRequest.dateKind === "updatedAt"
            ? t("shell.pullRequestUpdatedAt", { date: timestampLabel })
            : t("shell.pullRequestDetectedAt", { date: timestampLabel })}
        </Paragraph>
      ) : null}
      {pullRequest.url ? (
        <Button
          onPress={() => void onOpenPullRequest(pullRequest.url)}
          size="$3"
          style={{ alignSelf: "flex-start", marginTop: 12 }}
          themeInverse
        >
          {t("shell.pullRequestOpen")}
        </Button>
      ) : null}
    </View>
  );
}

function renderStateLabel(
  state: WorkspacePullRequestCardState,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return state === "merged"
    ? t("shell.pullRequestStateMerged")
    : state === "closed"
      ? t("shell.pullRequestStateClosed")
      : state === "draft"
        ? t("shell.pullRequestStateDraft")
        : state === "approved"
          ? t("shell.pullRequestStateApproved")
          : t("shell.pullRequestStateOpen");
}

function getStatePalette(state: WorkspacePullRequestCardState, theme: ReturnType<typeof useTheme>) {
  switch (state) {
    case "merged":
      return {
        background: theme.green3.val,
        foreground: theme.green11.val,
      };
    case "closed":
      return {
        background: theme.red3.val,
        foreground: theme.red11.val,
      };
    case "draft":
      return {
        background: theme.orange3.val,
        foreground: theme.orange11.val,
      };
    case "approved":
      return {
        background: theme.green3.val,
        foreground: theme.green11.val,
      };
    default:
      return {
        background: theme.blue3.val,
        foreground: theme.blue11.val,
      };
  }
}

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}
