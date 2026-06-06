import { Alert, Box, LinearProgress, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { findExternalAppPreset, isExternalAppPlatformSupported } from "../../../../shared/contracts/externalApps";
import { ConfirmationDialog } from "../../../components/ConfirmationDialog";
import { ContextMenu } from "../../../components/ContextMenu";
import { FileQuickOpenDialog } from "../../../components/FileQuickOpenDialog";
import { FileTree } from "../../../components/FileTree";
import { FileTreeToolbar } from "../../../components/FileTree/FileTreeToolbar";
import type { FileTreeContextMenuRequest } from "../../../components/FileTree/types";
import { getRendererPlatform } from "../../../helpers/platform";
import { useCommands } from "../../../hooks/useCommands";
import { useContextMenuState } from "../../../hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "../../../hooks/useSuppressNativeContextMenuWhileOpen";
import { tabStore } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { useFileDeletionConfirmation } from "./useFileDeletionConfirmation";
import { useFileSearchController } from "./useFileSearchController";
import { useFileTreeContextMenuItems } from "./useFileTreeContextMenuItems";
import { useFileTreeCreateEntryRequest } from "./useFileTreeCreateEntryRequest";
import { useFileTreeGitChanges } from "./useFileTreeGitChanges";
import { useFileTreeOperations } from "./useFileTreeOperations";

type FileManagerViewProps = {
  openFileSearchRequestKey?: number;
  lastHandledFileSearchRequestKey?: number;
  onFileSearchRequestHandled?: (requestKey: number) => void;
};

/** Computes one bounded progress percentage value for file operations. */
function getFileOperationProgressValue(operation: {
  processed: number;
  total: number;
}): number {
  if (operation.total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((operation.processed / operation.total) * 100));
}

/** Renders file tree + quick-open and delegates file operations to useFileTreeOperations. */
export function FileManagerView({
  openFileSearchRequestKey = 0,
  lastHandledFileSearchRequestKey = 0,
  onFileSearchRequestHandled,
}: FileManagerViewProps) {
  const { t } = useTranslation();
  const ops = useFileTreeOperations();
  const rendererPlatform = getRendererPlatform();
  const cmd = useCommands();
  const canOpenInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const lastUsedExternalAppId = workspaceStore((state) => state.lastUsedExternalAppId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath?.trim() ?? "",
  );
  const workspaceGitRefreshVersion = workspaceStore((state) => {
    if (!selectedWorkspaceWorktreePath) {
      return 0;
    }

    return state.gitRefreshVersionByWorktreePath?.[selectedWorkspaceWorktreePath] ?? 0;
  });
  const lastUsedWorkspaceExternalAppPreset = lastUsedExternalAppId
    ? findExternalAppPreset(lastUsedExternalAppId)
    : null;

  const { createEntryRequest, requestCreateFile, requestCreateFolder } = useFileTreeCreateEntryRequest();
  const {
    menu: contextMenu,
    openMenu: openContextMenu,
    closeMenu: closeContextMenu,
    isOpen: hasOpenContextMenu,
  } = useContextMenuState<FileTreeContextMenuRequest>();
  const selectedEntryPath = workspaceUiStore((state) => state.selectedEntryPath);
  const selectedEntryIsDirectory = selectedEntryPath ? ops.repoFiles.some((p) => p === `${selectedEntryPath}/`) : false;
  const {
    pendingFileDeletion,
    pendingFileDeletionDescriptionKey,
    isDeletingEntry,
    handleRequestFileDeletion,
    handleCancelFileDeletion,
    handleConfirmFileDeletion,
  } = useFileDeletionConfirmation({
    repoFiles: ops.repoFiles,
    deleteEntry: ops.onDeleteEntry,
  });
  const createEntryBasePath = selectedEntryPath
    ? selectedEntryIsDirectory
      ? selectedEntryPath
      : selectedEntryPath.split("/").slice(0, -1).join("/")
    : "";
  const deleteSelectionRequestId = workspaceUiStore((state) => state.deleteSelectionRequestId);
  const undoRequestId = workspaceUiStore((state) => state.undoRequestId);
  const setSelectedEntryPath = workspaceUiStore((state) => state.setSelectedEntryPath);
  const expandedItemsByWorkspaceId = workspaceUiStore((state) => state.expandedFileTreeItemsByWorkspaceId);
  const setExpandedFileTreeItems = workspaceUiStore((state) => state.setExpandedFileTreeItems);
  const [lastHandledDeleteSelectionRequestId, setLastHandledDeleteSelectionRequestId] = useState(0);
  const [lastHandledUndoRequestId, setLastHandledUndoRequestId] = useState(0);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const tabs = tabStore((state) => state.tabs);
  const lastRevealedTabIdRef = useRef("");

  const expandedItems = selectedWorkspaceId ? (expandedItemsByWorkspaceId[selectedWorkspaceId] ?? []) : [];

  /** Stores the current workspace's expanded directory list so it can be restored on switch-back. */
  const handleExpandedItemsChange = useCallback(
    (items: string[]) => {
      if (!selectedWorkspaceId) {
        return;
      }

      setExpandedFileTreeItems(selectedWorkspaceId, items);
    },
    [selectedWorkspaceId, setExpandedFileTreeItems],
  );

  useEffect(() => {
    return () => {
      setSelectedEntryPath("");
    };
  }, [setSelectedEntryPath]);

  useSuppressNativeContextMenuWhileOpen(hasOpenContextMenu);

  const visibleTreeFiles = ops.repoFiles;
  const gitChangesByPath = useFileTreeGitChanges({
    listGitChanges: cmd.listGitChanges,
    selectedWorkspaceWorktreePath,
    workspaceGitRefreshVersion,
  });

  useEffect(() => {
    if (!ops.fileTreeSelectionRequest?.path) {
      return;
    }

    setSelectedEntryPath(ops.fileTreeSelectionRequest.path);
  }, [ops.fileTreeSelectionRequest, setSelectedEntryPath]);

  useEffect(() => {
    const selectedTab = tabs.find((tab) => tab.id === selectedTabId && tab.workspaceId === selectedWorkspaceId);
    if (!selectedTab || selectedTab.kind !== "file") {
      lastRevealedTabIdRef.current = "";
      return;
    }

    if (lastRevealedTabIdRef.current === selectedTab.id) {
      return;
    }

    lastRevealedTabIdRef.current = selectedTab.id;
    ops.revealFileInTree(selectedTab.data.path);
  }, [ops, selectedTabId, selectedWorkspaceId, tabs]);

  useEffect(() => {
    if (deleteSelectionRequestId <= lastHandledDeleteSelectionRequestId) {
      return;
    }

    setLastHandledDeleteSelectionRequestId(deleteSelectionRequestId);
    if (!selectedEntryPath) {
      return;
    }

    handleRequestFileDeletion(selectedEntryPath);
  }, [deleteSelectionRequestId, handleRequestFileDeletion, lastHandledDeleteSelectionRequestId, selectedEntryPath]);

  useEffect(() => {
    if (undoRequestId <= lastHandledUndoRequestId) {
      return;
    }

    setLastHandledUndoRequestId(undoRequestId);
    if (!ops.canUndoLastEntryOperation) {
      return;
    }

    void ops.onUndoLastEntryOperation();
  }, [lastHandledUndoRequestId, ops, undoRequestId]);

  const openSearchResult = useCallback(
    async (path: string) => {
      if (path.endsWith("/")) {
        const directoryPath = path.replace(/\/+$/, "");
        if (!expandedItems.includes(directoryPath)) {
          handleExpandedItemsChange([...expandedItems, directoryPath]);
        }
        setSelectedEntryPath(directoryPath);
        setIsFileSearchOpen(false);
        return;
      }

      await ops.openWorkspaceFile(path);
      setIsFileSearchOpen(false);
    },
    [expandedItems, handleExpandedItemsChange, ops, setSelectedEntryPath],
  );
  const {
    isFileSearchOpen,
    setIsFileSearchOpen,
    fileSearchQuery,
    setFileSearchQuery,
    selectedSearchResultIndex,
    setSelectedSearchResultIndex,
    fileSearchResults,
    handleFileSearchInputKeyDown,
  } = useFileSearchController({
    workspaceWorktreePath: selectedWorkspaceWorktreePath || undefined,
    openFileSearchRequestKey,
    lastHandledFileSearchRequestKey,
    onFileSearchRequestHandled,
    openSearchResult,
  });

  const fileOperationModeLabel = ops.fileOperationState
    ? t(`files.operations.modes.${ops.fileOperationState.mode}`)
    : "";

  const { items: contextMenuItems, anchorPosition: contextMenuAnchorPosition } = useFileTreeContextMenuItems({
    t,
    rendererPlatform,
    contextMenu,
    closeContextMenu,
    canOpenInExternalApp,
    lastUsedWorkspaceExternalAppPreset,
    canPasteEntries: ops.canPasteEntries,
    handlers: {
      onCreateFile: ops.onCreateFile,
      onCreateFolder: ops.onCreateFolder,
      onRenameEntry: ops.onRenameEntry,
      onDeleteEntry: async (path: string) => {
        handleRequestFileDeletion(path);
      },
      onCopyPath: ops.onCopyPath,
      onCopyRelativePath: ops.onCopyRelativePath,
      onOpenInFileManager: ops.onOpenInFileManager,
      onOpenInExternalApp: ops.onOpenInExternalApp,
      onCopyEntry: ops.onCopyEntry,
      onCutEntry: ops.onCutEntry,
      onPasteEntries: ops.onPasteEntries,
    },
  });

  const fileOperationProgressText = ops.fileOperationState
    ? ops.fileOperationState.currentPath
      ? t("files.operations.progressWithPath", {
          mode: fileOperationModeLabel,
          processed: ops.fileOperationState.processed,
          total: ops.fileOperationState.total,
          path: ops.fileOperationState.currentPath,
        })
      : t("files.operations.progress", {
          mode: fileOperationModeLabel,
          processed: ops.fileOperationState.processed,
          total: ops.fileOperationState.total,
        })
    : "";

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {ops.fileOperationState?.status === "running" ? (
        <Box sx={{ px: 1.5, pt: 1, pb: 0.25, display: "flex", flexDirection: "column", gap: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" data-testid="file-operation-progress-label">
            {fileOperationProgressText}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={getFileOperationProgressValue(ops.fileOperationState)}
            data-testid="file-operation-progress-bar"
          />
        </Box>
      ) : null}
      {ops.fileOperationError ? (
        <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
          <Alert severity="error" data-testid="file-operation-error">
            {ops.fileOperationError}
          </Alert>
        </Box>
      ) : null}
      <FileTreeToolbar
        createFileActionLabel={t("files.actions.createFile")}
        createFolderActionLabel={t("files.actions.createFolder")}
        refreshActionLabel={t("files.actions.refresh")}
        canCreateFile={Boolean(ops.onCreateFile)}
        canCreateFolder={Boolean(ops.onCreateFolder)}
        canRefresh={Boolean(ops.onRefresh)}
        onCreateFile={() => {
          requestCreateFile(createEntryBasePath);
        }}
        onCreateFolder={() => {
          requestCreateFolder(createEntryBasePath);
        }}
        onRefresh={() => {
          void ops.onRefresh?.();
        }}
      />
      <FileTree
        files={visibleTreeFiles}
        gitChangesByPath={gitChangesByPath}
        ignoredPaths={ops.ignoredRepoPaths}
        expandedItems={expandedItems}
        worktreePath={selectedWorkspaceWorktreePath || undefined}
        selectionRequest={ops.fileTreeSelectionRequest}
        createEntryRequest={createEntryRequest}
        onExpandedItemsChange={handleExpandedItemsChange}
        onEnsurePathLoaded={ops.ensurePathLoaded}
        onSelectEntry={({ path, isDirectory }) => {
          setSelectedEntryPath(path);
          if (isDirectory) {
            return;
          }

          void ops.openWorkspaceFile(path, { temporary: true });
        }}
        onOpenEntry={({ path, isDirectory }) => {
          if (isDirectory) {
            return;
          }

          void ops.openWorkspaceFile(path);
        }}
        onCreateEntry={async ({ path, isDirectory }) => {
          if (isDirectory) {
            await ops.onCreateFolder(path);
            return;
          }

          await ops.onCreateFile(path);
        }}
        onRenameEntry={ops.onRenameEntry}
        onDeleteEntry={async (path) => {
          handleRequestFileDeletion(path);
        }}
        onCopyEntry={ops.onCopyEntry}
        onCutEntry={ops.onCutEntry}
        canPasteEntries={ops.canPasteEntries}
        onPasteEntries={ops.onPasteEntries}
        onDropExternalEntries={ops.onDropExternalEntries}
        onMoveEntries={ops.onMoveEntries}
        canUndoLastEntryOperation={ops.canUndoLastEntryOperation}
        onUndoLastEntryOperation={ops.onUndoLastEntryOperation}
        onItemContextMenu={(request) => {
          openContextMenu(request);
        }}
      />
      <ContextMenu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        anchorPosition={contextMenuAnchorPosition}
        marginThreshold={0}
        submenuDirection="left"
        items={contextMenuItems}
      />
      <ConfirmationDialog
        open={Boolean(pendingFileDeletion)}
        title={t("files.actions.delete")}
        description={t(pendingFileDeletionDescriptionKey, { path: pendingFileDeletion?.path ?? "" })}
        confirmLabel={
          isDeletingEntry ? t("common.actions.deleting", { defaultValue: "Deleting..." }) : t("files.actions.delete")
        }
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isDeletingEntry}
        onCancel={handleCancelFileDeletion}
        onConfirm={handleConfirmFileDeletion}
      />
      <FileQuickOpenDialog
        open={isFileSearchOpen}
        query={fileSearchQuery}
        selectedResultIndex={selectedSearchResultIndex}
        results={fileSearchResults}
        placeholder={t("files.search.placeholder")}
        emptyText={t("files.search.empty")}
        onClose={() => {
          setIsFileSearchOpen(false);
        }}
        onQueryChange={(nextQuery) => {
          setFileSearchQuery(nextQuery);
          setSelectedSearchResultIndex(0);
        }}
        onInputKeyDown={handleFileSearchInputKeyDown}
        onSelectResultIndex={setSelectedSearchResultIndex}
        onOpenResult={(path, index) => {
          setSelectedSearchResultIndex(index);
          void openSearchResult(path);
        }}
      />
    </Box>
  );
}
