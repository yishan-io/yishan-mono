import { listFiles, listFilesBatch } from "@renderer/domains/files/commands/fileCommands";
import { fileTreeStore } from "@renderer/domains/files/state/fileTreeStore";

import { closeTab, openTab, renameTabsForEntryRename, workbenchNavigationStore } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";

import { tabStore } from "@renderer/domains/workbench";

import { workspaceStore } from "@renderer/domains/workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAppId, WorkspaceFileEntry } from "../../../externalApps";
import type { FileTreeClipboardState } from "../clipboard/clipboardSourceResolvers";
import { useFileTreeClipboard } from "../clipboard/useFileTreeClipboard";
import {
  getFileOperationErrorMessage,
  mapIgnoredWorkspaceEntryPaths,
  mapWorkspaceEntryPaths,
} from "../fileTreeEntries";
import { mergeWorkspaceEntries } from "../fileTreeMerge";
import { normalizeRelativePath } from "../fileTreePaths";
import { applyDirectoryRefreshes, resolveRefreshDirectoryPaths } from "../fileTreeRefreshRules";
import { useFileTreeCrud } from "../operations/useFileTreeCrud";
import { type FileTreeUndoAction, useFileTreeUndo } from "../operations/useFileTreeUndo";
import { type FileOperationState, useFileOperationState } from "../useFileOperationState";

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
  const treeCacheByIdentityRef = useRef(new Map<string, WorkspaceFileEntry[]>());
  const loadedDirectoryPathsByIdentityRef = useRef(new Map<string, string[]>());
  const initializedIdentityKeysRef = useRef(new Set<string>());
  const activeWorkspaceRef = useRef({ identityKey: "", generation: 0 });
  const latestBatchRequestIdRef = useRef(0);
  const treeRevisionByIdentityRef = useRef(new Map<string, number>());
  // Tracks which workspace identity the current repoEntries belong to.
  const repoEntriesIdentityKeyRef = useRef<string | undefined>(undefined);
  const fileTreeSelectionRequestIdRef = useRef(0);
  const loadedDirectoryPathsRef = useRef(new Set<string>());
  const loadingDirectoryPathsRef = useRef(new Set<string>());

  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces);
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
  const workspaceIdentityKey =
    selectedWorkspaceId && selectedWorkspaceWorktreePath
      ? `${selectedWorkspaceId}\u0000${selectedWorkspaceWorktreePath}`
      : "";
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
    if (!workspaceIdentityKey || repoEntriesIdentityKeyRef.current !== workspaceIdentityKey) {
      return;
    }
    treeCacheByIdentityRef.current.set(workspaceIdentityKey, repoEntries);
    loadedDirectoryPathsByIdentityRef.current.set(workspaceIdentityKey, [...loadedDirectoryPathsRef.current]);
  }, [repoEntries, workspaceIdentityKey]);

  useEffect(() => {
    const activeIdentityKeys = new Set(
      workspaces.flatMap((workspace) => {
        const worktreePath = workspace.worktreePath?.trim();
        return worktreePath ? [`${workspace.id}\u0000${worktreePath}`] : [];
      }),
    );
    for (const identityKey of treeCacheByIdentityRef.current.keys()) {
      if (!activeIdentityKeys.has(identityKey)) {
        treeCacheByIdentityRef.current.delete(identityKey);
        loadedDirectoryPathsByIdentityRef.current.delete(identityKey);
        initializedIdentityKeysRef.current.delete(identityKey);
      }
    }
    for (const identityKey of treeRevisionByIdentityRef.current.keys()) {
      if (!activeIdentityKeys.has(identityKey)) {
        treeRevisionByIdentityRef.current.delete(identityKey);
      }
    }
  }, [workspaces]);

  const refreshLoadedRepoFiles = useCallback(
    async (changedRelativePaths?: string[]): Promise<WorkspaceFileEntry[]> => {
      const capturedIdentityKey = workspaceIdentityKey;
      const capturedGeneration = activeWorkspaceRef.current.generation;
      const batchRequestId = ++latestBatchRequestIdRef.current;
      const treeRevision = (treeRevisionByIdentityRef.current.get(capturedIdentityKey) ?? 0) + 1;
      treeRevisionByIdentityRef.current.set(capturedIdentityKey, treeRevision);
      const isCurrentRequest = () =>
        activeWorkspaceRef.current.identityKey === capturedIdentityKey &&
        activeWorkspaceRef.current.generation === capturedGeneration &&
        latestBatchRequestIdRef.current === batchRequestId;

      if (!selectedWorkspaceWorktreePath || !capturedIdentityKey) {
        if (isCurrentRequest()) {
          repoEntriesRef.current = [];
          setRepoEntries([]);
        }
        return [];
      }

      const requiresRootLoad = !initializedIdentityKeysRef.current.has(capturedIdentityKey);
      const refreshDirectoryPaths = requiresRootLoad
        ? [""]
        : resolveRefreshDirectoryPaths(changedRelativePaths ?? [], loadedDirectoryPathsRef.current);
      try {
        const response = await listFilesBatch({
          workspaceId: selectedWorkspaceId ?? "",
          requests: refreshDirectoryPaths.map((directoryPath) => ({
            relativePath: directoryPath || undefined,
            recursive: !directoryPath,
          })),
        });
        if (!isCurrentRequest()) {
          return repoEntriesRef.current;
        }

        const rootResult = response.results.find((result) => !normalizeRelativePath(result.request.relativePath ?? ""));
        if (requiresRootLoad && (!rootResult || rootResult.error)) {
          return repoEntriesRef.current;
        }
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
          requiresRootLoad ? undefined : changedRelativePaths,
        );
        repoEntriesIdentityKeyRef.current = capturedIdentityKey;
        repoEntriesRef.current = nextEntries;
        // Cache the accepted root response before recording initialization.
        treeCacheByIdentityRef.current.set(capturedIdentityKey, nextEntries);
        loadedDirectoryPathsByIdentityRef.current.set(capturedIdentityKey, [...loadedDirectoryPathsRef.current]);
        if (requiresRootLoad) {
          initializedIdentityKeysRef.current.add(capturedIdentityKey);
        }
        setRepoEntries(nextEntries);
        return nextEntries;
      } catch (error) {
        if (isCurrentRequest()) {
          console.error("Failed to load workspace files", error);
        }
        return repoEntriesRef.current;
      }
    },
    [selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceIdentityKey],
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

      const loadedDirectoryPaths = loadedDirectoryPathsRef.current;
      const loadingDirectoryPaths = loadingDirectoryPathsRef.current;
      if (loadedDirectoryPaths.has(normalizedPath) || loadingDirectoryPaths.has(normalizedPath)) {
        return;
      }
      const capturedIdentityKey = workspaceIdentityKey;
      const capturedGeneration = activeWorkspaceRef.current.generation;
      const capturedTreeRevision = treeRevisionByIdentityRef.current.get(capturedIdentityKey) ?? 0;
      loadingDirectoryPaths.add(normalizedPath);

      try {
        const response = await listFiles({
          workspaceId: selectedWorkspaceId ?? "",
          relativePath: normalizedPath,
          recursive: false,
        });

        if (
          activeWorkspaceRef.current.identityKey !== capturedIdentityKey ||
          activeWorkspaceRef.current.generation !== capturedGeneration ||
          treeRevisionByIdentityRef.current.get(capturedIdentityKey) !== capturedTreeRevision
        ) {
          return;
        }
        const nextEntries = mergeWorkspaceEntries(repoEntriesRef.current, response.files);
        loadedDirectoryPaths.add(normalizedPath);
        repoEntriesRef.current = nextEntries;
        treeCacheByIdentityRef.current.set(capturedIdentityKey, nextEntries);
        loadedDirectoryPathsByIdentityRef.current.set(capturedIdentityKey, [...loadedDirectoryPaths]);
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
      } finally {
        loadingDirectoryPaths.delete(normalizedPath);
      }
    },
    [selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceIdentityKey],
  );

  useEffect(() => {
    if (activeWorkspaceRef.current.identityKey !== workspaceIdentityKey) {
      activeWorkspaceRef.current = {
        identityKey: workspaceIdentityKey,
        generation: activeWorkspaceRef.current.generation + 1,
      };
    }
    const cachedEntries = workspaceIdentityKey ? treeCacheByIdentityRef.current.get(workspaceIdentityKey) : null;
    const cachedLoadedDirectoryPaths = workspaceIdentityKey
      ? loadedDirectoryPathsByIdentityRef.current.get(workspaceIdentityKey)
      : null;
    const expandedItems = selectedWorkspaceId
      ? (fileTreeStore.getState().expandedFileTreeItemsByWorkspaceId[selectedWorkspaceId] ?? [])
      : [];
    repoEntriesIdentityKeyRef.current = workspaceIdentityKey || undefined;
    repoEntriesRef.current = cachedEntries ?? [];
    setRepoEntries(cachedEntries ?? []);
    resetFileOperationState();
    setFileOperationError(null);
    setClipboardState(null);
    setUndoStack([]);
    setFileTreeSelectionRequest(null);
    loadedDirectoryPathsRef.current = new Set(cachedLoadedDirectoryPaths ?? expandedItems);
    loadingDirectoryPathsRef.current = new Set();
  }, [resetFileOperationState, selectedWorkspaceId, setFileOperationError, workspaceIdentityKey]);

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
