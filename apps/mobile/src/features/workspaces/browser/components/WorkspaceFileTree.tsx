import { ChevronDown, ChevronRight, File as FileIcon, Folder, MoreVertical } from "@tamagui/lucide-icons";
import { memo, useCallback, useMemo } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Button, Text, XStack, useTheme } from "tamagui";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { WorkspaceFileTreeRow } from "@/features/workspaces/browser/state/useWorkspaceFileTree";
import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";
import { type WorkspaceFileTreeModel, useWorkspaceFileTreeModel } from "../view-model/useWorkspaceFileTreeModel";
import { WorkspaceEntryMenuSheet } from "./WorkspaceEntryMenuSheet";

type WorkspaceFileTreePaneProps = {
  activeDirectoryPath: string;
  browserStateId: string;
  focusedPath?: string;
  nodeId: string | null;
  organizationId: string;
  projectId: string;
  workspaceId: string;
  onOpenFile: (path: string) => void;
};

type WorkspaceFileTreeProps = {
  model: WorkspaceFileTreeModel;
};

const FILE_TREE_ROW_HEIGHT = 52;
const FILE_TREE_INITIAL_NUM_TO_RENDER = 18;
const FILE_TREE_MAX_TO_RENDER_PER_BATCH = 24;
const FILE_TREE_WINDOW_SIZE = 10;
const FILE_TREE_CONTENT_CONTAINER_STYLE = { paddingBottom: 20 };

export function WorkspaceFileTreePane({
  activeDirectoryPath,
  browserStateId,
  focusedPath,
  nodeId,
  organizationId,
  projectId,
  workspaceId,
  onOpenFile,
}: WorkspaceFileTreePaneProps) {
  const model = useWorkspaceFileTreeModel({
    activeDirectoryPath,
    browserStateId,
    focusedPath,
    nodeId,
    onOpenFile,
    organizationId,
    projectId,
    workspaceId,
  });

  return <WorkspaceFileTree model={model} />;
}

export function WorkspaceFileTree({ model }: WorkspaceFileTreeProps) {
  const { t } = useAppLanguage();
  const menuActions = useMemo(
    () => [
      {
        label: t("shell.copyPath"),
        onPress: model.onCopyMenuEntryPath,
      },
    ],
    [model.onCopyMenuEntryPath, t],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<WorkspaceFileTreeRow> | null | undefined, index: number) => ({
      index,
      length: FILE_TREE_ROW_HEIGHT,
      offset: FILE_TREE_ROW_HEIGHT * index,
    }),
    [],
  );
  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      model.scrollListRef.current?.scrollToOffset({
        animated: false,
        offset: Math.max(0, info.averageItemLength * info.index),
      });
    },
    [model.scrollListRef],
  );
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      model.onScrollOffsetChange(event.nativeEvent.contentOffset.y);
    },
    [model],
  );
  const renderItem = useCallback(
    ({ item }: { item: WorkspaceFileTreeRow }) => (
      <TreeRowButton
        activeDirectoryPath={model.activeDirectoryPath}
        focusedPath={model.focusedPath}
        moreActionsLabel={t("common.moreActions")}
        onOpenFile={model.onOpenFile}
        onOpenMenu={model.onOpenMenu}
        onToggleDirectory={model.onToggleDirectory}
        row={item}
      />
    ),
    [model.activeDirectoryPath, model.focusedPath, model.onOpenFile, model.onOpenMenu, model.onToggleDirectory, t],
  );

  if (model.loading) {
    return <LoadingView label={t("shell.loadingFiles")} />;
  }

  if (model.error) {
    return <ErrorState onRetry={() => void model.refetch()} />;
  }

  if (model.empty) {
    return <EmptyState title={t("shell.files")} message={t("shell.noFilesYet")} />;
  }

  return (
    <>
      <FlatList
        ref={model.scrollListRef}
        data={model.rows}
        getItemLayout={getItemLayout}
        keyExtractor={(item) => item.entry.path}
        renderItem={renderItem}
        contentContainerStyle={FILE_TREE_CONTENT_CONTAINER_STYLE}
        initialNumToRender={FILE_TREE_INITIAL_NUM_TO_RENDER}
        maxToRenderPerBatch={FILE_TREE_MAX_TO_RENDER_PER_BATCH}
        removeClippedSubviews
        windowSize={FILE_TREE_WINDOW_SIZE}
        onContentSizeChange={model.setListContentSize}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onScroll={handleScroll}
        onMomentumScrollEnd={model.onScrollEnd}
        onScrollEndDrag={model.onScrollEnd}
        scrollEventThrottle={32}
      />
      <WorkspaceEntryMenuSheet
        actions={menuActions}
        entryName={model.menuEntry?.name ?? ""}
        onClose={model.onCloseMenu}
        open={!!model.menuEntry}
      />
    </>
  );
}

type TreeRowButtonProps = {
  activeDirectoryPath: string;
  focusedPath?: string;
  moreActionsLabel: string;
  onOpenFile: (path: string) => void;
  onOpenMenu: (entry: WorkspaceFileEntry) => void;
  onToggleDirectory: (path: string) => void;
  row: WorkspaceFileTreeRow;
};

function isRowActive(path: string, activeDirectoryPath: string, focusedPath?: string) {
  return path === activeDirectoryPath || path === focusedPath;
}

const TreeRowButton = memo(
  function TreeRowButton({
    activeDirectoryPath,
    focusedPath,
    moreActionsLabel,
    onOpenFile,
    onOpenMenu,
    onToggleDirectory,
    row,
  }: TreeRowButtonProps) {
    const theme = useTheme();
    const isActive = isRowActive(row.entry.path, activeDirectoryPath, focusedPath);
    const iconColor = row.entry.isIgnored ? "$gray10" : undefined;
    const handlePress = useCallback(() => {
      if (row.entry.isDir) {
        onToggleDirectory(row.entry.path);
        return;
      }

      onOpenFile(row.entry.path);
    }, [onOpenFile, onToggleDirectory, row.entry.isDir, row.entry.path]);
    const handleOpenMenu = useCallback(() => {
      onOpenMenu(row.entry);
    }, [onOpenMenu, row.entry]);

    return (
      <XStack
        style={{
          alignItems: "center",
          backgroundColor: isActive ? theme.gray3.val : "transparent",
          borderBottomColor: theme.gray4.val,
          borderBottomWidth: 1,
          gap: 4,
          height: FILE_TREE_ROW_HEIGHT,
          opacity: row.entry.isIgnored ? 0.58 : 1,
          paddingLeft: 16 + row.depth * 16,
          paddingRight: 12,
        }}
      >
        <Pressable onPress={handlePress} style={{ flex: 1 }}>
          <XStack style={{ alignItems: "center", gap: 8, minHeight: 30 }}>
            <View style={{ alignItems: "center", justifyContent: "center", width: 16 }}>
              {row.entry.isDir ? (
                row.isExpanded ? (
                  <ChevronDown color={iconColor} size={14} />
                ) : (
                  <ChevronRight color={iconColor} size={14} />
                )
              ) : null}
            </View>
            <View style={{ width: 18 }}>
              {row.entry.isDir ? <Folder color={iconColor} size={18} /> : <FileIcon color={iconColor} size={18} />}
            </View>
            <Text
              color={row.entry.isIgnored ? "$gray10" : undefined}
              fontSize="$4"
              fontWeight={isActive ? "700" : "500"}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {row.entry.name}
            </Text>
            {row.entry.isDir && row.isLoadingChildren ? (
              <Text color="$gray10" fontSize="$2" fontWeight="600">
                ...
              </Text>
            ) : row.entry.isDir && row.hasError ? (
              <Text color="$red10" fontSize="$2" fontWeight="700">
                !
              </Text>
            ) : null}
          </XStack>
        </Pressable>
        <Button chromeless size="$3" icon={MoreVertical} onPress={handleOpenMenu} aria-label={moreActionsLabel} />
      </XStack>
    );
  },
  (previousProps, nextProps) =>
    previousProps.row.entry.path === nextProps.row.entry.path &&
    previousProps.row.entry.name === nextProps.row.entry.name &&
    previousProps.row.entry.isDir === nextProps.row.entry.isDir &&
    previousProps.row.entry.isIgnored === nextProps.row.entry.isIgnored &&
    previousProps.row.depth === nextProps.row.depth &&
    previousProps.row.hasError === nextProps.row.hasError &&
    previousProps.row.isExpanded === nextProps.row.isExpanded &&
    previousProps.row.isLoadingChildren === nextProps.row.isLoadingChildren &&
    isRowActive(previousProps.row.entry.path, previousProps.activeDirectoryPath, previousProps.focusedPath) ===
      isRowActive(nextProps.row.entry.path, nextProps.activeDirectoryPath, nextProps.focusedPath) &&
    previousProps.moreActionsLabel === nextProps.moreActionsLabel &&
    previousProps.onOpenFile === nextProps.onOpenFile &&
    previousProps.onOpenMenu === nextProps.onOpenMenu &&
    previousProps.onToggleDirectory === nextProps.onToggleDirectory,
);
