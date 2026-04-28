import { Alert, Box, LinearProgress, Typography } from "@mui/material";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  type ExternalAppId,
  findExternalAppPreset,
  isExternalAppPlatformSupported,
} from "../../../../shared/contracts/externalApps";
import { ContextMenu } from "../../../components/ContextMenu";
import { FileQuickOpenDialog } from "../../../components/FileQuickOpenDialog";
import { FileTree } from "../../../components/FileTree";
import { FileTreeToolbar } from "../../../components/FileTree/FileTreeToolbar";
import { resolveDestinationDirectoryPath } from "../../../components/FileTree/treeUtils";
import type { FileTreeContextMenuRequest } from "../../../components/FileTree/types";
import { useContextMenuState } from "../../../hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "../../../hooks/useSuppressNativeContextMenuWhileOpen";
import { getRendererPlatform } from "../../../helpers/platform";
import { searchFiles } from "../../../search/fileSearch";
import { tabStore } from "../../../store/tabStore";
import { workspaceFileTreeStore } from "../../../store/workspaceFileTreeStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { buildWorkspaceFileTreeContextMenuItems } from "./buildWorkspaceFileTreeContextMenuItems";
import { useFileTreeOperations } from "./useFileTreeOperations";

const MAX_FILE_SEARCH_RESULTS = 100;

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
  const {
    repoFiles,
    ignoredRepoPaths,
    loadedDirectoryPaths,
    searchRepoFiles,
    searchIgnoredRepoPaths,
    fileOperationState,
    fileOperationError,
    fileTreeSelectionRequest,
    canPasteEntries,
    canUndoLastEntryOperation,
    revealFileInTree,
    loadExpandedDirectory,
    ensurePathLoaded,
    loadAllRepoFiles,
    openWorkspaceFile,
    onCreateFile,
    onCreateFolder,
    onRenameEntry,
    onDeleteEntry,
    onCopyPath,
    onCopyRelativePath,
    onOpenInFileManager,
    onOpenInExternalApp,
    onCopyEntry,
    onCutEntry,
    onPasteEntries,
    onDropExternalEntries,
    onRefresh,
    onUndoLastEntryOperation,
  } = useFileTreeOperations();
  const rendererPlatform = getRendererPlatform();
  const canOpenInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const lastUsedExternalAppId = workspaceStore((state) => state.lastUsedExternalAppId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const lastUsedWorkspaceExternalAppPreset = lastUsedExternalAppId
    ? findExternalAppPreset(lastUsedExternalAppId)
    : null;

  const [isFileSearchOpen, setIsFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [selectedSearchResultIndex, setSelectedSearchResultIndex] = useState(0);
  const [, setCreateEntryRequestId] = useState(0);
  const [createEntryRequest, setCreateEntryRequest] = useState<{
    kind: "file" | "folder";
    basePath?: string;
    requestId: number;
  } | null>(null);
  const {
    menu: contextMenu,
    openMenu: openContextMenu,
    closeMenu: closeContextMenu,
    isOpen: hasOpenContextMenu,
  } = useContextMenuState<FileTreeContextMenuRequest>();
  const selectedEntryPath = workspaceFileTreeStore((state) => state.selectedEntryPath);
  const deleteSelectionRequestId = workspaceFileTreeStore((state) => state.deleteSelectionRequestId);
  const undoRequestId = workspaceFileTreeStore((state) => state.undoRequestId);
  const setSelectedEntryPath = workspaceFileTreeStore((state) => state.setSelectedEntryPath);
  const [lastHandledDeleteSelectionRequestId, setLastHandledDeleteSelectionRequestId] = useState(0);
  const [lastHandledUndoRequestId, setLastHandledUndoRequestId] = useState(0);
  const [expandedItemsByWorkspaceId, setExpandedItemsByWorkspaceId] = useState<Record<string, string[]>>({});
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

      setExpandedItemsByWorkspaceId((currentState) => ({
        ...currentState,
        [selectedWorkspaceId]: items,
      }));
    },
    [selectedWorkspaceId],
  );

  useEffect(() => {
    return () => {
      setSelectedEntryPath("");
    };
  }, [setSelectedEntryPath]);

  useSuppressNativeContextMenuWhileOpen(hasOpenContextMenu);

  const visibleTreeFiles = repoFiles;
  const ignoredSearchRepoPathSet = useMemo(
    () => new Set(searchIgnoredRepoPaths.map((path) => path.replace(/\/+$/, ""))),
    [searchIgnoredRepoPaths],
  );
  const searchableFiles = useMemo(
    () => searchRepoFiles.filter((path) => !ignoredSearchRepoPathSet.has(path.replace(/\/+$/, ""))),
    [ignoredSearchRepoPathSet, searchRepoFiles],
  );
  const trimmedFileSearchQuery = fileSearchQuery.trim();
  const deferredFileSearchQuery = useDeferredValue(trimmedFileSearchQuery);
  const fileSearchResults = useMemo(
    () =>
      deferredFileSearchQuery
        ? searchFiles(searchableFiles, deferredFileSearchQuery).slice(0, MAX_FILE_SEARCH_RESULTS)
        : [],
    [deferredFileSearchQuery, searchableFiles],
  );

  useEffect(() => {
    if (openFileSearchRequestKey <= lastHandledFileSearchRequestKey) {
      return;
    }

    setFileSearchQuery("");
    setSelectedSearchResultIndex(0);
    setIsFileSearchOpen(true);
    void loadAllRepoFiles();
    onFileSearchRequestHandled?.(openFileSearchRequestKey);
  }, [lastHandledFileSearchRequestKey, loadAllRepoFiles, onFileSearchRequestHandled, openFileSearchRequestKey]);

  useEffect(() => {
    if (selectedSearchResultIndex < fileSearchResults.length) {
      return;
    }

    setSelectedSearchResultIndex(Math.max(0, fileSearchResults.length - 1));
  }, [fileSearchResults.length, selectedSearchResultIndex]);

  useEffect(() => {
    if (!fileTreeSelectionRequest?.path) {
      return;
    }

    setSelectedEntryPath(fileTreeSelectionRequest.path);
  }, [fileTreeSelectionRequest, setSelectedEntryPath]);

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
    revealFileInTree(selectedTab.data.path);
  }, [revealFileInTree, selectedTabId, selectedWorkspaceId, tabs]);

  useEffect(() => {
    if (deleteSelectionRequestId <= lastHandledDeleteSelectionRequestId) {
      return;
    }

    setLastHandledDeleteSelectionRequestId(deleteSelectionRequestId);
    if (!selectedEntryPath) {
      return;
    }

    void onDeleteEntry(selectedEntryPath);
  }, [deleteSelectionRequestId, lastHandledDeleteSelectionRequestId, onDeleteEntry, selectedEntryPath]);

  useEffect(() => {
    if (undoRequestId <= lastHandledUndoRequestId) {
      return;
    }

    setLastHandledUndoRequestId(undoRequestId);
    if (!canUndoLastEntryOperation) {
      return;
    }

    void onUndoLastEntryOperation();
  }, [canUndoLastEntryOperation, lastHandledUndoRequestId, onUndoLastEntryOperation, undoRequestId]);

  const openSearchResult = useCallback(
    async (path: string) => {
      if (path.endsWith("/")) {
        const directoryPath = path.replace(/\/+$/, "");
        await loadExpandedDirectory(directoryPath);
        if (!expandedItems.includes(directoryPath)) {
          handleExpandedItemsChange([...expandedItems, directoryPath]);
        }
        setSelectedEntryPath(directoryPath);
        setIsFileSearchOpen(false);
        return;
      }

      await openWorkspaceFile(path);
      setIsFileSearchOpen(false);
    },
    [expandedItems, handleExpandedItemsChange, loadExpandedDirectory, openWorkspaceFile, setSelectedEntryPath],
  );

  /** Opens the currently highlighted quick-search result if one exists. */
  const openSelectedSearchResult = useCallback(async () => {
    const selectedResult = fileSearchResults[selectedSearchResultIndex];
    if (!selectedResult) {
      return;
    }

    await openSearchResult(selectedResult.path);
  }, [fileSearchResults, openSearchResult, selectedSearchResultIndex]);

  /** Handles keyboard navigation and submit behavior in the quick-search input. */
  const handleFileSearchInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (fileSearchResults.length === 0) {
          return;
        }

        setSelectedSearchResultIndex((current) => Math.min(current + 1, fileSearchResults.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (fileSearchResults.length === 0) {
          return;
        }

        setSelectedSearchResultIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void openSelectedSearchResult();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsFileSearchOpen(false);
      }
    },
    [fileSearchResults.length, openSelectedSearchResult],
  );

  const fileOperationModeLabel = fileOperationState ? t(`files.operations.modes.${fileOperationState.mode}`) : "";

  const contextPasteDestination = resolveDestinationDirectoryPath(
    contextMenu?.targetPath ?? "",
    Boolean(contextMenu?.targetIsDirectory),
  );
  const showOpenInExternalAppMenuItem = Boolean(canOpenInExternalApp && contextMenu?.targetPath);
  const showOpenInLastUsedExternalAppMenuItem = Boolean(
    showOpenInExternalAppMenuItem && lastUsedWorkspaceExternalAppPreset,
  );
  const contextMenuItems = buildWorkspaceFileTreeContextMenuItems({
    labels: {
      createFile: t("files.actions.createFile"),
      createFolder: t("files.actions.createFolder"),
      rename: t("files.actions.rename"),
      delete: t("files.actions.delete"),
      copy: t("files.actions.copy"),
      cut: t("files.actions.cut"),
      paste: t("files.actions.paste"),
      copyPath: t("files.actions.copyPath"),
      copyRelativePath: t("files.actions.copyRelativePath"),
      openInFileManager:
        rendererPlatform === "win32" ? t("files.actions.openInExplorer") : t("files.actions.openInFinder"),
      openInExternalApp: t("files.actions.openInExternalApp"),
      openInLastUsedExternalApp: lastUsedWorkspaceExternalAppPreset
        ? t("files.actions.openInExternalAppQuick", { app: lastUsedWorkspaceExternalAppPreset.label })
        : "",
    },
    canCreateAtContext: !contextMenu?.targetPath || Boolean(contextMenu.targetIsDirectory),
    canCreateFile: Boolean(onCreateFile),
    canCreateFolder: Boolean(onCreateFolder),
    canRenameEntry: Boolean(onRenameEntry),
    canDeleteEntry: Boolean(onDeleteEntry),
    canCopyEntry: Boolean(onCopyEntry),
    canCutEntry: Boolean(onCutEntry),
    canPasteEntries: Boolean(canPasteEntries),
    canCopyPath: Boolean(onCopyPath),
    canCopyRelativePath: Boolean(onCopyRelativePath),
    canOpenInFileManager: Boolean(onOpenInFileManager),
    showOpenInExternalAppMenuItem,
    showOpenInLastUsedExternalAppMenuItem,
    contextBasePath: contextMenu?.basePath ?? "",
    contextTargetPath: contextMenu?.targetPath ?? "",
    contextPasteDestination,
    lastUsedWorkspaceExternalAppPreset,
    handlers: {
      startCreate: (_basePath, isDirectory) => {
        if (!contextMenu) {
          return;
        }
        if (isDirectory) {
          contextMenu.startCreateFolder();
          closeContextMenu();
          return;
        }
        contextMenu.startCreateFile();
        closeContextMenu();
      },
      rename: () => {
        contextMenu?.startRename?.();
        closeContextMenu();
      },
      delete: async () => {
        if (!onDeleteEntry || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onDeleteEntry(contextMenu.targetPath);
      },
      copyEntry: async () => {
        if (!onCopyEntry || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onCopyEntry(contextMenu.targetPath);
      },
      cutEntry: async () => {
        if (!onCutEntry || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onCutEntry(contextMenu.targetPath);
      },
      pasteEntries: async (destinationPath: string) => {
        if (!onPasteEntries || !canPasteEntries) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onPasteEntries(destinationPath);
      },
      copyPath: async () => {
        if (!onCopyPath || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onCopyPath(contextMenu.targetPath);
      },
      copyRelativePath: async () => {
        if (!onCopyRelativePath || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onCopyRelativePath(contextMenu.targetPath);
      },
      openInFileManager: async () => {
        if (!onOpenInFileManager || !contextMenu?.targetPath) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onOpenInFileManager(contextMenu.targetPath);
      },
      openInExternalApp: async (appId: ExternalAppId) => {
        if (!onOpenInExternalApp) {
          closeContextMenu();
          return;
        }
        closeContextMenu();
        await onOpenInExternalApp({ appId, path: contextMenu?.targetPath || undefined });
      },
    },
  });
  const contextMenuAnchorPosition =
    contextMenu && typeof contextMenu.mouseX === "number" && typeof contextMenu.mouseY === "number"
      ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
      : undefined;

  const fileOperationProgressText = fileOperationState
    ? fileOperationState.currentPath
      ? t("files.operations.progressWithPath", {
          mode: fileOperationModeLabel,
          processed: fileOperationState.processed,
          total: fileOperationState.total,
          path: fileOperationState.currentPath,
        })
      : t("files.operations.progress", {
          mode: fileOperationModeLabel,
          processed: fileOperationState.processed,
          total: fileOperationState.total,
        })
    : "";

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {fileOperationState?.status === "running" ? (
        <Box sx={{ px: 1.5, pt: 1, pb: 0.25, display: "flex", flexDirection: "column", gap: 0.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" data-testid="file-operation-progress-label">
            {fileOperationProgressText}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={getFileOperationProgressValue(fileOperationState)}
            data-testid="file-operation-progress-bar"
          />
        </Box>
      ) : null}
      {fileOperationError ? (
        <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
          <Alert severity="error" data-testid="file-operation-error">
            {fileOperationError}
          </Alert>
        </Box>
      ) : null}
      <FileTreeToolbar
        createFileActionLabel={t("files.actions.createFile")}
        createFolderActionLabel={t("files.actions.createFolder")}
        refreshActionLabel={t("files.actions.refresh")}
        canCreateFile={Boolean(onCreateFile)}
        canCreateFolder={Boolean(onCreateFolder)}
        canRefresh={Boolean(onRefresh)}
        onCreateFile={() => {
          setCreateEntryRequestId((current) => {
            const requestId = current + 1;
            setCreateEntryRequest({ kind: "file", requestId });
            return requestId;
          });
        }}
        onCreateFolder={() => {
          setCreateEntryRequestId((current) => {
            const requestId = current + 1;
            setCreateEntryRequest({ kind: "folder", requestId });
            return requestId;
          });
        }}
        onRefresh={() => {
          void onRefresh?.();
        }}
      />
      <FileTree
        files={visibleTreeFiles}
        ignoredPaths={ignoredRepoPaths}
        loadedDirectoryPaths={loadedDirectoryPaths}
        expandedItems={expandedItems}
        selectionRequest={fileTreeSelectionRequest}
        createEntryRequest={createEntryRequest}
        onExpandedItemsChange={handleExpandedItemsChange}
        onLoadDirectory={loadExpandedDirectory}
        onEnsurePathLoaded={ensurePathLoaded}
        onSelectEntry={({ path, isDirectory }) => {
          setSelectedEntryPath(path);
          if (isDirectory) {
            return;
          }

          void openWorkspaceFile(path, { temporary: true });
        }}
        onOpenEntry={({ path, isDirectory }) => {
          if (isDirectory) {
            return;
          }

          void openWorkspaceFile(path);
        }}
        onCreateEntry={async ({ path, isDirectory }) => {
          if (isDirectory) {
            await onCreateFolder(path);
            return;
          }

          await onCreateFile(path);
        }}
        onRenameEntry={onRenameEntry}
        onDeleteEntry={onDeleteEntry}
        onCopyEntry={onCopyEntry}
        onCutEntry={onCutEntry}
        canPasteEntries={canPasteEntries}
        onPasteEntries={onPasteEntries}
        onDropExternalEntries={onDropExternalEntries}
        canUndoLastEntryOperation={canUndoLastEntryOperation}
        onUndoLastEntryOperation={onUndoLastEntryOperation}
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
