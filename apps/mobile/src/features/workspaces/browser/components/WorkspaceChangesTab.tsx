import { getBaseName, getParentPath } from "@yishan/file-browser-core";
import { Pressable, SectionList } from "react-native";
import { Text, XStack, YStack, useTheme } from "tamagui";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type {
  WorkspaceGitChange,
  WorkspaceGitChangeKind,
  WorkspaceGitChanges,
} from "@/features/workspaces/workspaces.types";
import {
  type ChangeSection,
  type WorkspaceChangesTabModel,
  useWorkspaceChangesTabModel,
} from "../view-model/useWorkspaceChangesTabModel";

type WorkspaceChangesTabPaneProps = {
  browserStateId: string;
  focusedPath?: string;
  organizationId: string;
  projectId: string;
  workspaceId: string;
  onOpenDiff: (path: string, changeKind: WorkspaceGitChangeKind) => void;
};

type WorkspaceChangesTabProps = {
  model: WorkspaceChangesTabModel;
};

export function WorkspaceChangesTabPane({
  browserStateId,
  focusedPath,
  organizationId,
  projectId,
  workspaceId,
  onOpenDiff,
}: WorkspaceChangesTabPaneProps) {
  const model = useWorkspaceChangesTabModel({
    browserStateId,
    focusedPath,
    onOpenDiff,
    organizationId,
    projectId,
    workspaceId,
  });

  return <WorkspaceChangesTab model={model} />;
}

export function WorkspaceChangesTab({ model }: WorkspaceChangesTabProps) {
  const { t } = useAppLanguage();

  if (model.loading) {
    return <LoadingView label={t("shell.loadingChanges")} />;
  }

  if (model.error) {
    return <ErrorState onRetry={() => void model.refetch()} />;
  }

  if (model.empty) {
    return <EmptyState title={t("shell.changesEmptyTitle")} message={t("shell.changesEmptyMessage")} />;
  }

  return (
    <SectionList
      ref={model.scrollListRef}
      sections={model.sections}
      keyExtractor={(item, index) => `${item.path}-${index}`}
      renderItem={({ item, section }) => <ChangeRow change={item} model={model} sectionId={section.id} />}
      renderSectionHeader={({ section }) => <ChangeSectionHeader count={section.data.length} title={section.title} />}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 20 }}
      onContentSizeChange={model.setListContentSize}
      onScroll={(event) => {
        model.onScrollOffsetChange(event.nativeEvent.contentOffset.y);
      }}
      onMomentumScrollEnd={model.onScrollEnd}
      onScrollEndDrag={model.onScrollEnd}
      scrollEventThrottle={32}
    />
  );
}

function ChangeSectionHeader({ count, title }: { count: number; title: string }) {
  const theme = useTheme();

  return (
    <XStack
      style={{
        alignItems: "center",
        backgroundColor: theme.background.val,
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 16,
      }}
    >
      <Text fontSize="$4" fontWeight="700">
        {title}
      </Text>
      <Text color="$gray10" fontSize="$2" fontWeight="700">
        {count}
      </Text>
    </XStack>
  );
}

function ChangeRow({
  change,
  model,
  sectionId,
}: {
  change: WorkspaceGitChange;
  model: WorkspaceChangesTabModel;
  sectionId: ChangeSection["id"];
}) {
  const theme = useTheme();
  const indicator = model.getChangeSectionIndicator(change.kind, sectionId);
  const parentPath = model.getChangeParentPath(change.path);
  const isFocused = change.path === model.focusedPath;
  const indicatorBackgroundColor =
    indicator.fillKey === "$blue3"
      ? theme.blue3.val
      : indicator.fillKey === "$green3"
        ? theme.green3.val
        : indicator.fillKey === "$red3"
          ? theme.red3.val
          : theme.yellow3.val;

  return (
    <Pressable onPress={() => model.onOpenDiff(change.path, change.kind)}>
      <XStack
        style={{
          alignItems: "center",
          backgroundColor: isFocused ? theme.gray3.val : "transparent",
          borderBottomColor: theme.gray4.val,
          borderBottomWidth: 1,
          gap: 12,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <XStack
          style={{
            alignItems: "center",
            backgroundColor: indicatorBackgroundColor,
            borderRadius: 999,
            height: 22,
            justifyContent: "center",
            width: 22,
          }}
        >
          <Text color={indicator.colorKey} fontSize="$2" fontWeight="800">
            {indicator.label}
          </Text>
        </XStack>
        <YStack style={{ flex: 1, gap: 2 }}>
          <Text fontSize="$4" fontWeight="600" numberOfLines={1}>
            {model.getChangeBaseName(change.path)}
          </Text>
          <Text color="$gray10" fontSize="$2" numberOfLines={1}>
            {parentPath || "."}
          </Text>
        </YStack>
        <YStack style={{ alignItems: "flex-end", gap: 2 }}>
          {change.additions > 0 ? (
            <Text color="$green10" fontSize="$2" fontWeight="700">
              +{change.additions}
            </Text>
          ) : null}
          {change.deletions > 0 ? (
            <Text color="$red10" fontSize="$2" fontWeight="700">
              -{change.deletions}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </Pressable>
  );
}
