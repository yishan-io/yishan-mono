import { FlatList, ScrollView, View } from "react-native";
import { Paragraph, Text, XStack, useTheme } from "tamagui";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { PaneBodyNotice, PaneBodyScrollView } from "@/components/ui/PaneBody";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { detectFilePreviewKind, splitPreviewLines } from "@/features/workspaces/file-browser";
import {
  type WorkspaceFilePreviewModel,
  useWorkspaceFilePreviewModel,
} from "@/features/workspaces/preview/view-model/useWorkspaceFilePreviewModel";

type WorkspaceFilePreviewPaneProps = {
  organizationId: string;
  path: string;
  projectId: string;
  workspaceId: string;
};
const PREVIEW_LINE_ROW_HEIGHT = 26;

type WorkspaceFilePreviewProps = {
  model: WorkspaceFilePreviewModel;
};

export function WorkspaceFilePreviewPane({
  organizationId,
  path,
  projectId,
  workspaceId,
}: WorkspaceFilePreviewPaneProps) {
  const model = useWorkspaceFilePreviewModel({
    organizationId,
    path,
    projectId,
    workspaceId,
  });

  return <WorkspaceFilePreview model={model} />;
}

export function WorkspaceFilePreview({ model }: WorkspaceFilePreviewProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  if (model.loading) {
    return <LoadingView label={t("shell.loadingFilePreview")} />;
  }

  if (model.error) {
    return <ErrorState onRetry={() => void model.refetch()} />;
  }

  if (model.previewKind === "unsupported") {
    return (
      <EmptyState title={t("shell.filePreviewUnsupportedTitle")} message={t("shell.filePreviewUnsupportedMessage")} />
    );
  }

  if (model.previewKind === "image") {
    return <EmptyState title={t("shell.filePreviewImageTitle")} message={t("shell.filePreviewImageMessage")} />;
  }

  if (model.previewText.length === 0) {
    return <EmptyState title={t("shell.filePreviewEmptyTitle")} message={t("shell.filePreviewEmptyMessage")} />;
  }

  if (model.previewKind === "markdown") {
    return (
      <PaneBodyScrollView gap={12} style={{ backgroundColor: theme.background.val }} topPadding={16}>
        {model.truncated ? <Paragraph color="$yellow10">{t("shell.filePreviewTruncatedMessage")}</Paragraph> : null}
        <Paragraph lineHeight={24}>{model.previewText}</Paragraph>
      </PaneBodyScrollView>
    );
  }

  return (
    <View
      style={{
        backgroundColor: theme.background.val,
        flex: 1,
      }}
    >
      {model.truncated ? <PaneBodyNotice>{t("shell.filePreviewTruncatedMessage")}</PaneBodyNotice> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <FlatList
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
          data={model.previewLines}
          getItemLayout={(_, index) => ({
            index,
            length: PREVIEW_LINE_ROW_HEIGHT,
            offset: PREVIEW_LINE_ROW_HEIGHT * index,
          })}
          initialNumToRender={60}
          keyExtractor={(_, index) => `line-${index + 1}`}
          removeClippedSubviews
          renderItem={({ index, item }) => <PreviewLineRow index={index} line={item} />}
          showsVerticalScrollIndicator
          style={{ minWidth: "100%", paddingTop: 12 }}
          windowSize={8}
        />
      </ScrollView>
    </View>
  );
}

function PreviewLineRow({ index, line }: { index: number; line: string }) {
  return (
    <XStack style={{ alignItems: "flex-start", gap: 12, minHeight: PREVIEW_LINE_ROW_HEIGHT }}>
      <Text
        color="$gray10"
        fontSize="$3"
        selectable={false}
        style={{ fontFamily: "monospace", minWidth: 34, paddingVertical: 2, textAlign: "right" }}
      >
        {index + 1}
      </Text>
      <Text
        fontSize="$3"
        lineHeight={22}
        selectable
        style={{ flexShrink: 1, fontFamily: "monospace", paddingVertical: 2 }}
      >
        {line.length > 0 ? line : " "}
      </Text>
    </XStack>
  );
}
