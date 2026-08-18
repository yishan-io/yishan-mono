import { Alert, Box } from "@mui/material";
import { useGitCommands } from "@renderer/app/commands/useCommands";
import { useDetectedExternalAppIds } from "@renderer/domains/files/ui/hooks/useDetectedExternalAppIds";
import { tabStore } from "@renderer/domains/workbench";
import { getRendererPlatform } from "@renderer/helpers/platform";
import { ContextMenu } from "@renderer/ui/components/ContextMenu";
import { useContextMenuState } from "@renderer/ui/hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "@renderer/ui/hooks/useSuppressNativeContextMenuWhileOpen";
import { FileTree } from "./file-tree";
import { FileTreeToolbar } from "./file-tree/FileTreeToolbar";
import type { FileTreeContextMenuRequest } from "./file-tree/types";

import { setExpandedFileTreeItems, setSelectedEntryPath } from "@renderer/domains/files";
import { fileTreeStore } from "@renderer/domains/files";
import { useWorkspaceGitRefreshVersion } from "@renderer/domains/git";
import {
  useSelectedWorkspaceId,
  useSelectedWorkspaceWorktreePath,
} from "@renderer/domains/workspace/ui/hooks/useWorkspaceReadHooks";
import {
  findExternalAppPreset,
  getExternalAppMenuEntries,
  isExternalAppPlatformSupported,
  isExternalAppPresetReliablyDetectableOnPlatform,
  isExternalAppPresetSupportedOnPlatform,
} from "@shared/contracts/externalApps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectLastUsedExternalAppId } from "../../../domains/project/hooks/useProjectLastUsedExternalAppId";
import { FileDeletionFeedback } from "./FileDeletionFeedback";
import { FileOperationStatus } from "./FileOperationStatus";
import { useFileDeletionConfirmation } from "./useFileDeletionConfirmation";
import { useFileTreeContextMenuItems } from "./useFileTreeContextMenuItems";
import { useFileTreeCreateEntryRequest } from "./useFileTreeCreateEntryRequest";
import { useFileTreeGitChanges } from "./useFileTreeGitChanges";
import { useFileTreeOperations } from "./useFileTreeOperations";
import { useFileTreeSignalHandlers } from "./useFileTreeSignalHandlers";
type FileManagerViewProps = Record<string, never>;

/** Renders file tree + quick-open and delegates file operations to useFileTreeOperations. */
export function FileManagerView(_props: FileManagerViewProps) {
  const { t } = useTranslation();
  const ops = useFileTreeOperations();
  const rendererPlatform = getRendererPlatform();
  const cmd = useGitCommands();
  const canOpenInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const lastUsedExternalAppId = useProjectLastUsedExternalAppId();
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const selectedWorkspaceWorktreePath = useSelectedWorkspaceWorktreePath();
  const workspaceGitRefreshVersion = useWorkspaceGitRefreshVersion(selectedWorkspaceWorktreePath);
  const [fileManagerLastUsed, setFileManagerLastUsed] = useState(false);
  const detectedExternalAppIds = useDetectedExternalAppIds();

  const lastUsedWorkspaceExternalAppPreset = lastUsedExternalAppId
    ? findExternalAppPreset(lastUsedExternalAppId)
    : null;
  const externalAppMenuEntries = useMemo(
    () =>
      detectedExternalAppIds === undefined ? [] : getExternalAppMenuEntries(rendererPlatform, detectedExternalAppIds),
    [detectedExternalAppIds, rendererPlatform],
  );
  const filteredLastUsedWorkspaceExternalAppPreset = useMemo(() => {
    if (!lastUsedWorkspaceExternalAppPreset) {
      return null;
    }

    if (!isExternalAppPresetSupportedOnPlatform(lastUsedWorkspaceExternalAppPreset.id, rendererPlatform)) {
      return null;
    }

    if (detectedExternalAppIds === undefined) {
      return null;
    }

    if (detectedExternalAppIds === null) {
      return lastUsedWorkspaceExternalAppPreset;
    }

    return detectedExternalAppIds.includes(lastUsedWorkspaceExternalAppPreset.id) ||
      !isExternalAppPresetReliablyDetectableOnPlatform(lastUsedWorkspaceExternalAppPreset.id, rendererPlatform)
      ? lastUsedWorkspaceExternalAppPreset
      : null;
  }, [detectedExternalAppIds, lastUsedWorkspaceExternalAppPreset, rendererPlatform]);
  const toolbarAppPreset = fileManagerLastUsed
    ? { id: "system-file-manager", label: "Finder", iconSrc: "app-icons/finder.png" }
    : filteredLastUsedWorkspaceExternalAppPreset;

  const { createEntryRequest, requestCreateFile, requestCreateFolder } = useFileTreeCreateEntryRequest();
  const {
    menu: contextMenu,
    openMenu: openContextMenu,
    closeMenu: closeContextMenu,
    isOpen: hasOpenContextMenu,
  } = useContextMenuState<FileTreeContextMenuRequest>();

  const selectedEntryPath = fileTreeStore((state) => state.selectedEntryPath);
  const selectedEntryIsDirectory = selectedEntryPath ? ops.repoFiles.some((p) => p === `${selectedEntryPath}/`) : false;
  const {
    pendingFileDeletion,
    pendingFileDeletionDescriptionKey,
    isDeletingEntry,
    handleRequestFileDeletion,
    handleRequestMultiFileDeletion,
    handleCancelFileDeletion,
    handleConfirmFileDeletion,
    deletionError,
    clearDeletionError,
  } = useFileDeletionConfirmation({
    repoFiles: ops.repoFiles,
    deleteEntry: ops.onDeleteEntry,
  });
  const createEntryBasePath = selectedEntryPath
    ? selectedEntryIsDirectory
      ? selectedEntryPath
      : selectedEntryPath.split("/").slice(0, -1).join("/")
    : "";
  const deleteSelectionRequestId = fileTreeStore((state) => state.deleteSelectionRequestId);
  const undoRequestId = fileTreeStore((state) => state.undoRequestId);
  const selectFolderInFileTreePath = fileTreeStore((state) => state.selectFolderInFileTreePath);
  const selectFolderInFileTreeRequestId = fileTreeStore((state) => state.selectFolderInFileTreeRequestId);
  const expandedItemsByWorkspaceId = fileTreeStore((state) => state.expandedFileTreeItemsByWorkspaceId);
  const selectedTabId = tabStore((state) => state.selectedTabId);
  const tabs = tabStore((state) => state.tabs);
  const lastRevealedTabIdRef = useRef("");
  const lastAppliedFolderSelectionRequestIdRef = useRef(0);

  const expandedItems = selectedWorkspaceId ? (expandedItemsByWorkspaceId[selectedWorkspaceId] ?? []) : [];

  /** Stores the current workspace's expanded directory list so it can be restored on switch-back. */
  const handleExpandedItemsChange = useCallback(
    (items: string[]) => {
      if (!selectedWorkspaceId) {
        return;
      }

      setExpandedFileTreeItems(selectedWorkspaceId, items);
    },
    [selectedWorkspaceId],
  );

  useEffect(() => {
    return () => {
      setSelectedEntryPath("");
    };
  }, []);

  useSuppressNativeContextMenuWhileOpen(hasOpenContextMenu);

  const visibleTreeFiles = ops.repoFiles;
  const gitChangesByPath = useFileTreeGitChanges({
    listGitChanges: cmd.listGitChanges,
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    workspaceGitRefreshVersion,
  });

  useEffect(() => {
    if (!ops.fileTreeSelectionRequest?.path) {
      return;
    }

    setSelectedEntryPath(ops.fileTreeSelectionRequest.path);
  }, [ops.fileTreeSelectionRequest]);

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
    if (
      !selectFolderInFileTreePath ||
      selectFolderInFileTreeRequestId === lastAppliedFolderSelectionRequestIdRef.current
    ) {
      return;
    }

    lastAppliedFolderSelectionRequestIdRef.current = selectFolderInFileTreeRequestId;
    ops.revealFileInTree(selectFolderInFileTreePath);
  }, [ops, selectFolderInFileTreePath, selectFolderInFileTreeRequestId]);

  useFileTreeSignalHandlers({
    selectedEntryPath,
    deleteSelectionRequestId,
    undoRequestId,
    canUndoLastEntryOperation: ops.canUndoLastEntryOperation,
    handleRequestFileDeletion,
    onUndoLastEntryOperation: ops.onUndoLastEntryOperation,
  });

  const requestFileDeletion = useCallback(
    async (path: string) => {
      handleRequestFileDeletion(path);
    },
    [handleRequestFileDeletion],
  );

  const confirmFileDeletion = useCallback(async () => {
    await handleConfirmFileDeletion();
  }, [handleConfirmFileDeletion]);

  const fileOperationModeLabel = ops.fileOperationState
    ? t(`files.operations.modes.${ops.fileOperationState.mode}`)
    : "";

  const { items: contextMenuItems, anchorPosition: contextMenuAnchorPosition } = useFileTreeContextMenuItems({
    t,
    rendererPlatform,
    contextMenu,
    closeContextMenu,
    canOpenInExternalApp,
    lastUsedWorkspaceExternalAppPreset: filteredLastUsedWorkspaceExternalAppPreset,
    externalAppMenuEntries,
    canPasteEntries: ops.canPasteEntries,
    handlers: {
      onCreateFile: ops.onCreateFile,
      onCreateFolder: ops.onCreateFolder,
      onRenameEntry: ops.onRenameEntry,
      onDeleteEntry: requestFileDeletion,
      onDeleteMultipleEntries: handleRequestMultiFileDeletion,
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
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <FileOperationStatus
        operationState={ops.fileOperationState}
        operationError={ops.fileOperationError}
        progressText={fileOperationProgressText}
      />
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
        canOpenInExternalApp={canOpenInExternalApp}
        lastUsedWorkspaceExternalAppPreset={toolbarAppPreset}
        openInAppLabel={t("files.actions.openInExternalApp")}
        externalAppMenuEntries={externalAppMenuEntries}
        openInFileManagerLabel={
          rendererPlatform === "win32" ? t("files.actions.openInExplorer") : t("files.actions.openInFinder")
        }
        onOpenInExternalApp={(appId) => {
          setFileManagerLastUsed(false);
          void ops.onOpenInExternalApp({ appId });
        }}
        onOpenInFileManager={() => {
          setFileManagerLastUsed(true);
          void ops.onOpenInFileManager(selectedEntryPath || "");
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
        onSelectEntry={({ path, isDirectory, isMultiSelectOperation }) => {
          setSelectedEntryPath(path);
          if (isDirectory || isMultiSelectOperation) {
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
        onDeleteEntry={requestFileDeletion}
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
      <FileDeletionFeedback
        pendingFileDeletion={pendingFileDeletion}
        pendingFileDeletionDescriptionKey={pendingFileDeletionDescriptionKey}
        isDeletingEntry={isDeletingEntry}
        deletionError={deletionError}
        onConfirm={confirmFileDeletion}
        onCancel={handleCancelFileDeletion}
        onDismissError={clearDeletionError}
      />
    </Box>
  );
}
