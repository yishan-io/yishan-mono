import { FlatList, ScrollView, View } from "react-native";
import { useTheme } from "tamagui";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { PaneBodyNotice } from "@/components/ui/PaneBody";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import {
  type WorkspaceDiffPreviewModel,
  useWorkspaceDiffPreviewModel,
} from "@/features/workspaces/preview/view-model/useWorkspaceDiffPreviewModel";
import { hasRelayWorkspaceQueryContext } from "@/features/workspaces/queries/workspace-query-runtime";
import type { WorkspaceGitChangeKind } from "@/features/workspaces/workspaces.types";
import { WorkspaceDiffPreviewLineRow } from "./WorkspaceDiffPreviewLineRow";
import { WorkspacePreviewMissingContext } from "./WorkspacePreviewMissingContext";
import { useWorkspaceDiffPreviewLayout } from "./useWorkspaceDiffPreviewLayout";

type WorkspaceDiffPreviewPaneProps = {
  changeKind: WorkspaceGitChangeKind | null;
  nodeId: string | null;
  organizationId: string;
  path: string;
  projectId: string;
  workspaceId: string;
};

const DIFF_LINE_ROW_HEIGHT = 28;

type WorkspaceDiffPreviewProps = {
  model: WorkspaceDiffPreviewModel;
};

export function WorkspaceDiffPreviewPane({
  changeKind,
  nodeId,
  organizationId,
  path,
  projectId,
  workspaceId,
}: WorkspaceDiffPreviewPaneProps) {
  if (
    !hasRelayWorkspaceQueryContext({
      nodeId,
      organizationId,
      projectId,
      workspaceId,
    })
  ) {
    return <WorkspacePreviewMissingContext />;
  }

  return (
    <WorkspaceDiffPreviewPaneContent
      changeKind={changeKind}
      nodeId={nodeId}
      organizationId={organizationId}
      path={path}
      projectId={projectId}
      workspaceId={workspaceId}
    />
  );
}

function WorkspaceDiffPreviewPaneContent({
  changeKind,
  nodeId,
  organizationId,
  path,
  projectId,
  workspaceId,
}: WorkspaceDiffPreviewPaneProps) {
  const model = useWorkspaceDiffPreviewModel({
    changeKind,
    nodeId,
    organizationId,
    path,
    projectId,
    workspaceId,
  });

  return <WorkspaceDiffPreview model={model} />;
}

export function WorkspaceDiffPreview({ model }: WorkspaceDiffPreviewProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const { handleLayout, minPreviewWidth } = useWorkspaceDiffPreviewLayout();

  if (model.loading) {
    return <LoadingView label={t("shell.loadingChanges")} />;
  }

  if (model.error) {
    return <ErrorState onRetry={() => void model.refetch()} />;
  }

  if (model.previewUnavailable) {
    return (
      <EmptyState title={t("shell.diffPreviewUnavailableTitle")} message={t("shell.diffPreviewUnavailableMessage")} />
    );
  }

  if (model.lines.length === 0) {
    if (model.truncated) {
      return (
        <EmptyState title={t("shell.diffPreviewTruncatedTitle")} message={t("shell.diffPreviewTruncatedMessage")} />
      );
    }

    return <EmptyState title={t("shell.diffPreviewEmptyTitle")} message={t("shell.diffPreviewEmptyMessage")} />;
  }

  return (
    <View
      onLayout={handleLayout}
      style={{
        backgroundColor: theme.background.val,
        flex: 1,
      }}
    >
      {model.truncated ? (
        <PaneBodyNotice topPadding={0}>{t("shell.filePreviewTruncatedMessage")}</PaneBodyNotice>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: minPreviewWidth || undefined }}>
          <FlatList
            contentContainerStyle={{
              paddingBottom: MOBILE_UI_TOKENS.pane.bodyBottom,
              paddingTop: model.truncated ? 0 : MOBILE_UI_TOKENS.pane.bodyTop,
            }}
            data={model.lines}
            getItemLayout={(_, index) => ({
              index,
              length: DIFF_LINE_ROW_HEIGHT,
              offset: DIFF_LINE_ROW_HEIGHT * index,
            })}
            initialNumToRender={80}
            keyExtractor={(_, index) => `diff-line-${index + 1}`}
            removeClippedSubviews
            renderItem={({ item }) => <WorkspaceDiffPreviewLineRow line={item} minWidth={minPreviewWidth} />}
            showsVerticalScrollIndicator
            style={{ width: minPreviewWidth || undefined }}
            windowSize={8}
          />
        </View>
      </ScrollView>
    </View>
  );
}
