import { listFiles, listFilesBatch } from "@renderer/domains/files/commands/fileCommands";
import { fileTreeStore } from "@renderer/domains/files/state/fileTreeStore";

import { closeTab, openTab, renameTabsForEntryRename, workbenchNavigationStore } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";

import { projectStore } from "@renderer/domains/project";
import { tabStore } from "@renderer/domains/workbench";

import { workspaceStore } from "@renderer/domains/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAppId, WorkspaceFileEntry } from "../../externalApps";
import type { FileTreeClipboardState } from "./clipboardSourceResolvers";
import { getFileOperationErrorMessage, mapIgnoredWorkspaceEntryPaths, mapWorkspaceEntryPaths } from "./fileTreeHelpers";
import { mergeWorkspaceEntries } from "./fileTreeOperationHelpers";
import { normalizeRelativePath } from "./fileTreePathHelpers";
import {
  applyDirectoryRefreshes,
  getImmediateChildPath,
  resolveRefreshDirectoryPaths,
  shouldEvictChangedEntry,
} from "./fileTreeRefreshRules";
import { type FileOperationState, useFileOperationState } from "./useFileOperationState";
import { useFileTreeClipboard } from "./useFileTreeClipboard";
import { useFileTreeCrud } from "./useFileTreeCrud";
import { type FileTreeUndoAction, useFileTreeUndo } from "./useFileTreeUndo";

export type FileTreeSelectionRequest = {
  path: string;
  requestId: number;
  focus?: boolean;
};

export type UseFileTreeOperationsResult = {
  repoFiles: string[];
  ignoredRepoPaths: string[];
  fileOperationState: FileOperationState | null;
  fileOperationError: string | null;
  fileTreeSelectionRequest: FileTreeSelectionRequest | null;
  canPasteEntries: boolean;
  canUndoLastEntryOperation: boolean;
  revealFileInTree: (path: string | null) => void;
  ensurePathLoaded: (path: string) => Promise<void>;
  loadAllRepoFiles: () => Promise<string[]>;
  openWorkspaceFile: (path: string, options?: { temporary?: boolean }) => Promise<void>;
  onCreateFile: (path: string) => Promise<void>;
  onCreateFolder: (path: string) => Promise<void>;
  onRenameEntry: (path: string, nextName: string) => Promise<void>;
  onDeleteEntry: (path: string) => Promise<void>;
  onCopyPath: (path: string) => Promise<void>;
  onCopyRelativePath: (path: string) => Promise<void>;
  onOpenInFileManager: (path: string) => Promise<void>;
  onOpenInExternalApp: (input: {
    path?: string;
    appId: ExternalAppId;
  }) => Promise<void>;
  onCopyEntry: (path: string) => Promise<void>;
  onCutEntry: (path: string) => Promise<void>;
  onPasteEntries: (destinationPath: string) => Promise<void>;
  onDropExternalEntries: (sourcePaths: string[], destinationPath: string) => Promise<void>;
  /** Moves entries within the workspace via drag-and-drop. */
  onMoveEntries: (sourceRelativePaths: string[], destinationPath: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onUndoLastEntryOperation: () => Promise<void>;
};

const EMPTY_CHANGED_RELATIVE_PATHS: string[] = [];

export function useFileTreeOperations(): UseFileTreeOperationsResult {
  const [repoEntries, setRepoEntries] = useState<WorkspaceFileEntry[]>([]);
  const [clipboardState, setClipboardState] = useState<FileTreeClipboardState | null>(null);
  const [undoStack, setUndoStack] = useState<FileTreeUndoAction[]>([]);
  const [fileTreeSelectionRequest, setFileTreeSelectionRequest] = useState<FileTreeSelectionRequest | null>(null);
  const repoEntriesRef = useRef<WorkspaceFileEntry[]>([]);
  const treeCacheByWorkspaceIdRef = useRef(new Map<string, WorkspaceFileEntry[]>());
  const loadedDirectoryPathsByWorkspaceIdRef = useRef(new Map<string, string[]>());
  // Tracks which workspace the current repoEntries belong to.
  // Used to prevent the cache-save effect from writing stale entries from the
  // previous workspace under the new workspace's key on the transition render.
  const repoEntriesWorkspaceIdRef = useRef<string | undefined>(undefined);
  const fileTreeSelectionRequestIdRef = useRef(0);
  const loadedDirectoryPathsRef = useRef(new Set<string>());

  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces);
  const expandedFileTreeItemsByWorkspaceId = fileTreeStore((state) => state.expandedFileTreeItemsByWorkspaceId);
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) =>
      state.workspaces
        .find((workspace) => workspace.id === workbenchNavigationStore.getState().activeWorkspaceId)
        ?.worktreePath?.trim() ?? "",
  );
  const changedRelativePathsForSelectedWorkspace = fileTreeStore((state) =>
    selectedWorkspaceWorktreePath
      ? (state.fileTreeChangedRelativePathsByWorktreePath?.[selectedWorkspaceWorktreePath] ??
        EMPTY_CHANGED_RELATIVE_PATHS)
      : EMPTY_CHANGED_RELATIVE_PATHS,
  );
  const fileTreeRefreshVersion = fileTreeStore((state) => state.fileTreeRefreshVersion);
  const tabs = tabStore((state) => state.tabs);
  const {
    fileOperationState,
    fileOperationError,
    setFileOperationError,
    resetFileOperationState,
    beginFileOperation,
    completeFileOperation,
    failFileOperation,
  } = useFileOperationState(selectedWorkspaceWorktreePath);
  const repoFiles = useMemo(() => mapWorkspaceEntryPaths(repoEntries), [repoEntries]);
  const ignoredRepoPaths = useMemo(() => mapIgnoredWorkspaceEntryPaths(repoEntries), [repoEntries]);

  useEffect(() => {
    repoEntriesRef.current = repoEntries;
  }, [repoEntries]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    // Only write the cache when repoEntries actually belong to this workspace.
    // On the transition render (workspace just changed) selectedWorkspaceId is
    // already the new id but repoEntries still holds the previous workspace's
    // files. Writing here would corrupt the new workspace's cache slot.
    if (repoEntriesWorkspaceIdRef.current !== selectedWorkspaceId) {
      return;
    }
    treeCacheByWorkspaceIdRef.current.set(selectedWorkspaceId, repoEntries);
    loadedDirectoryPathsByWorkspaceIdRef.current.set(selectedWorkspaceId, [...loadedDirectoryPathsRef.current]);
  }, [repoEntries, selectedWorkspaceId]);

  useEffect(() => {
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const cacheByWorkspaceId = treeCacheByWorkspaceIdRef.current;
    for (const cachedWorkspaceId of cacheByWorkspaceId.keys()) {
      if (!activeWorkspaceIds.has(cachedWorkspaceId)) {
        cacheByWorkspaceId.delete(cachedWorkspaceId);
        loadedDirectoryPathsByWorkspaceIdRef.current.delete(cachedWorkspaceId);
      }
    }
  }, [workspaces]);

  const refreshLoadedRepoFiles = useCallback(
    async (changedRelativePaths?: string[]): Promise<WorkspaceFileEntry[]> => {
      if (!selectedWorkspaceWorktreePath) {
        setRepoEntries([]);
        return [];
      }

      try {
        const refreshDirectoryPaths = resolveRefreshDirectoryPaths(
          changedRelativePaths ?? [],
          loadedDirectoryPathsRef.current,
        );
        const response = await listFilesBatch({
          workspaceId: selectedWorkspaceId ?? "",
          requests: refreshDirectoryPaths.map((directoryPath) => ({
            relativePath: directoryPath || undefined,
            // Root fetch is recursive (full tree); loaded-subdirectory refreshes
            // are shallow — the applyDirectoryRefreshes + changedRelativePaths
            // filter handles evicting renamed/deleted entries without re-reading
            // entire subtrees on every file-change event.
            recursive: !directoryPath,
          })),
        });
        const refreshResults = response.results
          .filter((result) => !result.error)
          .map((result) => ({
            directoryPath: normalizeRelativePath(result.request.relativePath ?? ""),
            files: result.files,
          }));

        const nextEntries = applyDirectoryRefreshes(
          repoEntriesRef.current,
          refreshResults,
          loadedDirectoryPathsRef.current,
          changedRelativePaths,
        );
        repoEntriesWorkspaceIdRef.current = selectedWorkspaceId ?? undefined;
        repoEntriesRef.current = nextEntries;
        setRepoEntries(nextEntries);
        return nextEntries;
      } catch (error) {
        setRepoEntries([]);
        repoEntriesRef.current = [];
        console.error("Failed to load workspace files", error);
        return [];
      }
    },
    [selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const loadAllRepoFiles = useCallback(async (): Promise<string[]> => {
    const entries = await refreshLoadedRepoFiles();
    return mapWorkspaceEntryPaths(entries);
  }, [refreshLoadedRepoFiles]);

  const ensurePathLoaded = useCallback(
    async (path: string): Promise<void> => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const normalizedPath = normalizeRelativePath(path);
      if (!normalizedPath) {
        return;
      }

      if (loadedDirectoryPathsRef.current.has(normalizedPath)) {
        return;
      }
      loadedDirectoryPathsRef.current.add(normalizedPath);

      try {
        const response = await listFiles({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: normalizedPath,
          recursive: false,
        });

        const nextEntries = mergeWorkspaceEntries(repoEntriesRef.current, response.files);
        repoEntriesRef.current = nextEntries;
        setRepoEntries(nextEntries);
      } catch (error) {
        // Suppress benign filesystem errors (stale worktree, removed path, broken symlink)
        const message = getErrorMessage(error);
        const msgLower = message.toLowerCase();
        const isBenignFsError =
          msgLower.includes("not a directory") ||
          msgLower.includes("no such file") ||
          msgLower.includes("enoent") ||
          msgLower.includes("enotdir");
        if (!isBenignFsError) {
          console.error("Failed to load workspace directory", {
            path: normalizedPath,
            error,
          });
        }
      }
    },
    [selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  useEffect(() => {
    const cachedEntries = selectedWorkspaceId ? treeCacheByWorkspaceIdRef.current.get(selectedWorkspaceId) : null;
    const cachedLoadedDirectoryPaths = selectedWorkspaceId
      ? loadedDirectoryPathsByWorkspaceIdRef.current.get(selectedWorkspaceId)
      : null;
    const expandedItems = selectedWorkspaceId ? (expandedFileTreeItemsByWorkspaceId[selectedWorkspaceId] ?? []) : [];
    repoEntriesWorkspaceIdRef.current = selectedWorkspaceId ?? undefined;
    setRepoEntries(cachedEntries ?? []);
    resetFileOperationState();
    setFileOperationError(null);
    setClipboardState(null);
    setUndoStack([]);
    setFileTreeSelectionRequest(null);
    loadedDirectoryPathsRef.current = new Set(cachedLoadedDirectoryPaths ?? expandedItems);
  }, [expandedFileTreeItemsByWorkspaceId, resetFileOperationState, selectedWorkspaceId, setFileOperationError]);

  const requestFileTreeSelection = useCallback((path: string | null, focus = true) => {
    const normalizedPath = normalizeRelativePath(path ?? "");
    if (!normalizedPath) {
      return;
    }

    fileTreeSelectionRequestIdRef.current += 1;
    setFileTreeSelectionRequest({
      path: normalizedPath,
      requestId: fileTreeSelectionRequestIdRef.current,
      focus,
    });
  }, []);

  const { pushUndoAction, handleUndoLastFileTreeOperation } = useFileTreeUndo({
    selectedWorkspaceWorktreePath,
    selectedWorkspaceId,
    tabs,
    closeTab,
    renameTabsForEntryRename,
    loadAllRepoFiles,
    setFileOperationError,
    getFileOperationErrorMessage,
    undoStack,
    setUndoStack,
  });

  const {
    openWorkspaceFile,
    handleDeleteEntry,
    onCreateFile,
    onCreateFolder,
    onRenameEntry,
    onCopyPath,
    onCopyRelativePath,
    onOpenInFileManager,
    onOpenInExternalApp,
  } = useFileTreeCrud({
    selectedWorkspaceWorktreePath,
    selectedWorkspaceId,
    tabs,
    repoFiles,
    repoEntries,
    closeTab,
    renameTabsForEntryRename,
    openTab,
    loadAllRepoFiles,
    pushUndoAction,
    requestFileTreeSelection,
  });

  const { setInternalClipboardState, onPasteEntries, onDropExternalEntries, onMoveEntries } = useFileTreeClipboard({
    selectedWorkspaceId,
    selectedWorkspaceWorktreePath,
    repoEntries,
    clipboardState,
    setClipboardState,
    loadAllRepoFiles,
    pushUndoAction,
    requestFileTreeSelection,
    beginFileOperation,
    completeFileOperation,
    failFileOperation,
    setFileOperationError,
  });

  useEffect(() => {
    void fileTreeRefreshVersion;
    void refreshLoadedRepoFiles(changedRelativePathsForSelectedWorkspace);
  }, [changedRelativePathsForSelectedWorkspace, fileTreeRefreshVersion, refreshLoadedRepoFiles]);

  return {
    repoFiles,
    ignoredRepoPaths,
    fileOperationState,
    fileOperationError,
    fileTreeSelectionRequest,
    canPasteEntries: Boolean(selectedWorkspaceWorktreePath),
    canUndoLastEntryOperation: undoStack.length > 0,
    revealFileInTree: (path: string | null) => {
      requestFileTreeSelection(path, false);
    },
    ensurePathLoaded,
    loadAllRepoFiles,
    openWorkspaceFile,
    onCreateFile,
    onCreateFolder,
    onRenameEntry,
    onDeleteEntry: handleDeleteEntry,
    onCopyPath,
    onCopyRelativePath,
    onOpenInFileManager,
    onOpenInExternalApp,
    onCopyEntry: async (path: string) => {
      setInternalClipboardState("copy", path);
    },
    onCutEntry: async (path: string) => {
      setInternalClipboardState("move", path);
    },
    onPasteEntries,
    onDropExternalEntries,
    onMoveEntries,
    onRefresh: async () => {
      await loadAllRepoFiles();
    },
    onUndoLastEntryOperation: async () => {
      await handleUndoLastFileTreeOperation();
    },
  };
}
