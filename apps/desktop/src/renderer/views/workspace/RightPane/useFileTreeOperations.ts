import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { WorkspaceFileEntry } from "../../../../shared/contracts/rpcRequestTypes";
import { listFiles, listFilesBatch } from "../../../commands/fileCommands";
import { loadWorkspaceFromBackend } from "../../../commands/projectCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { useCommands } from "../../../hooks/useCommands";
import { tabStore } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import type { FileTreeClipboardState } from "./clipboardSourceResolvers";
import {
  getFileOperationErrorMessage,
  mapIgnoredWorkspaceEntryPaths,
  mapWorkspaceEntryPaths,
} from "./fileTreeHelpers";
import {
  isMissingWorkspacePathError,
  mergeWorkspaceEntries,
} from "./fileTreeOperationHelpers";
import { getParentRelativePath, normalizeRelativePath } from "./fileTreePathHelpers";
import { useFileOperationState, type FileOperationState } from "./useFileOperationState";
import { useFileTreeClipboard } from "./useFileTreeClipboard";
import { useFileTreeCrud } from "./useFileTreeCrud";
import { useFileTreeUndo, type FileTreeUndoAction } from "./useFileTreeUndo";

export type FileTreeSelectionRequest = {
  path: string;
  requestId: number;
  focus?: boolean;
};

export type UseFileTreeOperationsResult = {
  repoFiles: string[];
  ignoredRepoPaths: string[];
  searchRepoFiles: string[];
  searchIgnoredRepoPaths: string[];
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
  onOpenInExternalApp: (input: { path?: string; appId: ExternalAppId }) => Promise<void>;
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

function getImmediateChildPath(parentPath: string, descendantPath: string): string | null {
  const normalizedParentPath = normalizeRelativePath(parentPath);
  const normalizedDescendantPath = normalizeRelativePath(descendantPath);
  if (!normalizedDescendantPath) {
    return null;
  }

  if (!normalizedParentPath) {
    const firstSegment = normalizedDescendantPath.split("/").filter(Boolean)[0];
    return firstSegment ?? null;
  }

  if (!normalizedDescendantPath.startsWith(`${normalizedParentPath}/`)) {
    return null;
  }

  const remainder = normalizedDescendantPath.slice(normalizedParentPath.length + 1);
  const firstSegment = remainder.split("/").filter(Boolean)[0];
  return firstSegment ? `${normalizedParentPath}/${firstSegment}` : null;
}

function resolveRefreshDirectoryPaths(changedRelativePaths: string[], loadedDirectoryPaths: Set<string>): string[] {
  if (changedRelativePaths.length === 0) {
    return ["", ...loadedDirectoryPaths].sort((left, right) => left.localeCompare(right));
  }

  const refreshPaths = new Set<string>();
  for (const changedPath of changedRelativePaths) {
    const normalizedChangedPath = normalizeRelativePath(changedPath);
    if (!normalizedChangedPath) {
      refreshPaths.add("");
      continue;
    }

    let candidate = normalizedChangedPath;
    for (;;) {
      if (loadedDirectoryPaths.has(candidate)) {
        refreshPaths.add(candidate);
        break;
      }

      const parentPath = getParentRelativePath(candidate);
      if (!parentPath) {
        refreshPaths.add("");
        break;
      }

      candidate = parentPath;
    }
  }

  return [...refreshPaths].sort((left, right) => left.localeCompare(right));
}

function applyDirectoryRefreshes(
  currentEntries: WorkspaceFileEntry[],
  refreshResults: Array<{ directoryPath: string; files: WorkspaceFileEntry[] }>,
  loadedDirectoryPaths: Set<string>,
): WorkspaceFileEntry[] {
  let nextEntries = currentEntries;

  for (const { directoryPath, files } of refreshResults) {
    const incomingImmediateChildPaths = new Set(
      files.map((entry) => normalizeRelativePath(entry.path)).filter((path) => path.length > 0),
    );
    const removedLoadedDirectories: string[] = [];

    for (const loadedDirectoryPath of [...loadedDirectoryPaths]) {
      const immediateChildPath = getImmediateChildPath(directoryPath, loadedDirectoryPath);
      if (!immediateChildPath || incomingImmediateChildPaths.has(immediateChildPath)) {
        continue;
      }

      loadedDirectoryPaths.delete(loadedDirectoryPath);
      removedLoadedDirectories.push(loadedDirectoryPath);
    }

    nextEntries = nextEntries.filter((entry) => {
      const normalizedEntryPath = normalizeRelativePath(entry.path);
      if (!normalizedEntryPath) {
        return false;
      }

      if (getParentRelativePath(normalizedEntryPath) === directoryPath) {
        return false;
      }

      return !removedLoadedDirectories.some(
        (removedPath) =>
          normalizedEntryPath === removedPath || normalizedEntryPath.startsWith(`${removedPath}/`),
      );
    });
    nextEntries = mergeWorkspaceEntries(nextEntries, files);
  }

  return nextEntries;
}

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

  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces);
  const expandedFileTreeItemsByWorkspaceId = workspaceUiStore((state) => state.expandedFileTreeItemsByWorkspaceId);
  const selectedWorkspaceWorktreePath = workspaceStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath,
  );
  const fileTreeRefreshVersion = workspaceStore((state) => state.fileTreeRefreshVersion);
  const changedRelativePathsForSelectedWorkspace = workspaceStore((state) => {
    const workspaceWorktreePath =
      state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.worktreePath?.trim() ?? "";
    if (!workspaceWorktreePath) {
      return EMPTY_CHANGED_RELATIVE_PATHS;
    }

    return state.fileTreeChangedRelativePathsByWorktreePath?.[workspaceWorktreePath] ?? EMPTY_CHANGED_RELATIVE_PATHS;
  });
  const { openTab, closeTab, renameTabsForEntryRename, setLastUsedExternalAppId } = useCommands();
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
  const searchRepoFiles = repoFiles;
  const searchIgnoredRepoPaths = ignoredRepoPaths;

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

  const refreshLoadedRepoFiles = useCallback(async (changedRelativePaths?: string[]): Promise<WorkspaceFileEntry[]> => {
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
        workspaceWorktreePath: selectedWorkspaceWorktreePath,
        requests: refreshDirectoryPaths.map((directoryPath) => ({
          relativePath: directoryPath || undefined,
          recursive: false,
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
      );
      repoEntriesWorkspaceIdRef.current = selectedWorkspaceId ?? undefined;
      repoEntriesRef.current = nextEntries;
      setRepoEntries(nextEntries);
      return nextEntries;
    } catch (error) {
      setRepoEntries([]);
      repoEntriesRef.current = [];
      if (isMissingWorkspacePathError(error)) {
        void loadWorkspaceFromBackend();
        return [];
      }
      console.error("Failed to load workspace files", error);
      return [];
    }
  }, [selectedWorkspaceId, selectedWorkspaceWorktreePath]);

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

      loadedDirectoryPathsRef.current.add(normalizedPath);

      try {
        const response = await listFiles({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: normalizedPath,
          recursive: false,
        });
        const nextEntries = applyDirectoryRefreshes(
          repoEntriesRef.current,
          [{ directoryPath: normalizedPath, files: response.files }],
          loadedDirectoryPathsRef.current,
        );
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
          console.error("Failed to load workspace directory", { path: normalizedPath, error });
        }
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  useEffect(() => {
    void selectedWorkspaceWorktreePath;
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
  }, [expandedFileTreeItemsByWorkspaceId, selectedWorkspaceId, selectedWorkspaceWorktreePath]);

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
    closeTab,
    renameTabsForEntryRename,
    openTab,
    setLastUsedExternalAppId,
    loadAllRepoFiles,
    pushUndoAction,
    requestFileTreeSelection,
  });

  const {
    setInternalClipboardState,
    onPasteEntries,
    onDropExternalEntries,
    onMoveEntries,
  } = useFileTreeClipboard({
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
    void refreshLoadedRepoFiles(changedRelativePathsForSelectedWorkspace);
  }, [changedRelativePathsForSelectedWorkspace, fileTreeRefreshVersion, refreshLoadedRepoFiles]);

  return {
    repoFiles,
    ignoredRepoPaths,
    searchRepoFiles,
    searchIgnoredRepoPaths,
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
