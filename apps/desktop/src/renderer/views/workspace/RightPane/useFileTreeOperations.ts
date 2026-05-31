import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { WorkspaceFileEntry } from "../../../../shared/contracts/rpcRequestTypes";
import { listFiles } from "../../../commands/fileCommands";
import { loadWorkspaceFromBackend } from "../../../commands/projectCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { useCommands } from "../../../hooks/useCommands";
import { tabStore } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";
import type { FileTreeClipboardState } from "./clipboardSourceResolvers";
import {
  getFileOperationErrorMessage,
  mapIgnoredWorkspaceEntryPaths,
  mapWorkspaceEntryPaths,
} from "./fileTreeHelpers";
import {
  buildNormalizedPathSet,
  hasVisibleImmediateChildren,
  isMissingWorkspacePathError,
  isPathWithinOrEqual,
  mergeWorkspaceEntries,
} from "./fileTreeOperationHelpers";
import { normalizeRelativePath } from "./fileTreePathHelpers";
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

export function useFileTreeOperations(): UseFileTreeOperationsResult {
  const [repoEntries, setRepoEntries] = useState<WorkspaceFileEntry[]>([]);
  const [clipboardState, setClipboardState] = useState<FileTreeClipboardState | null>(null);
  const [undoStack, setUndoStack] = useState<FileTreeUndoAction[]>([]);
  const [fileTreeSelectionRequest, setFileTreeSelectionRequest] = useState<FileTreeSelectionRequest | null>(null);
  const repoEntriesRef = useRef<WorkspaceFileEntry[]>([]);
  const selectedWorkspaceWorktreePathRef = useRef<string | undefined>(undefined);
  const treeCacheByWorkspaceIdRef = useRef(new Map<string, WorkspaceFileEntry[]>());
  const fileTreeSelectionRequestIdRef = useRef(0);
  const loadedDirectoryPathsRef = useRef(new Set<string>());
  const changedRelativePathsForSelectedWorkspaceRef = useRef<string[]>([]);

  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces);
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

  selectedWorkspaceWorktreePathRef.current = selectedWorkspaceWorktreePath;

  useEffect(() => {
    repoEntriesRef.current = repoEntries;
  }, [repoEntries]);

  useEffect(() => {
    changedRelativePathsForSelectedWorkspaceRef.current = changedRelativePathsForSelectedWorkspace;
  }, [changedRelativePathsForSelectedWorkspace]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    treeCacheByWorkspaceIdRef.current.set(selectedWorkspaceId, repoEntries);
  }, [repoEntries, selectedWorkspaceId]);

  useEffect(() => {
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const cacheByWorkspaceId = treeCacheByWorkspaceIdRef.current;
    for (const cachedWorkspaceId of cacheByWorkspaceId.keys()) {
      if (!activeWorkspaceIds.has(cachedWorkspaceId)) {
        cacheByWorkspaceId.delete(cachedWorkspaceId);
      }
    }
  }, [workspaces]);

  const loadAllRepoFiles = useCallback(async (): Promise<string[]> => {
    if (!selectedWorkspaceWorktreePath) {
      setRepoEntries([]);
      return [];
    }

    try {
      const response = await listFiles({
        workspaceWorktreePath: selectedWorkspaceWorktreePath,
        recursive: true,
      });
      setRepoEntries((currentEntries) => {
        const normalizedIncomingPathSet = buildNormalizedPathSet(response.files);
        const preservedLoadedDescendants = currentEntries.filter((entry) => {
          const normalizedEntryPath = normalizeRelativePath(entry.path);
          if (!normalizedEntryPath) {
            return false;
          }

          for (const changedRelativePath of changedRelativePathsForSelectedWorkspaceRef.current) {
            const normalizedChangedRelativePath = normalizeRelativePath(changedRelativePath);
            if (!normalizedChangedRelativePath) {
              continue;
            }

            if (
              isPathWithinOrEqual(normalizedEntryPath, normalizedChangedRelativePath) ||
              isPathWithinOrEqual(normalizedChangedRelativePath, normalizedEntryPath)
            ) {
              return false;
            }
          }

          for (const loadedDirectoryPath of loadedDirectoryPathsRef.current) {
            if (!normalizedEntryPath.startsWith(`${loadedDirectoryPath}/`)) {
              continue;
            }

            const incomingHasLoadedDescendant = [...normalizedIncomingPathSet].some((incomingPath) =>
              incomingPath.startsWith(`${loadedDirectoryPath}/`),
            );
            if (incomingHasLoadedDescendant) {
              return false;
            }

            return true;
          }

          return false;
        });

        return mergeWorkspaceEntries(response.files, preservedLoadedDescendants);
      });
      return mapWorkspaceEntryPaths(response.files);
    } catch (error) {
      setRepoEntries([]);
      if (isMissingWorkspacePathError(error)) {
        void loadWorkspaceFromBackend();
        return [];
      }
      console.error("Failed to load workspace files", error);
      return [];
    }
  }, [selectedWorkspaceWorktreePath]);

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

        if (hasVisibleImmediateChildren(normalizedPath, response.files)) {
          setRepoEntries((currentEntries) => mergeWorkspaceEntries(currentEntries, response.files));
          return;
        }

        const recursiveResponse = await listFiles({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: normalizedPath,
          recursive: true,
        });

        setRepoEntries((currentEntries) => mergeWorkspaceEntries(currentEntries, recursiveResponse.files));
      } catch (error) {
        // Suppress benign filesystem errors (stale worktree, removed path, broken symlink)
        const message = getErrorMessage(error);
        const isBenignFsError =
          message.includes("not a directory") ||
          message.includes("no such file") ||
          message.includes("ENOENT") ||
          message.includes("ENOTDIR");
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
    setRepoEntries(cachedEntries ?? []);
    resetFileOperationState();
    setFileOperationError(null);
    setClipboardState(null);
    setUndoStack([]);
    setFileTreeSelectionRequest(null);
    loadedDirectoryPathsRef.current = new Set<string>();
  }, [selectedWorkspaceId, selectedWorkspaceWorktreePath]);

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
    void loadAllRepoFiles();
  }, [changedRelativePathsForSelectedWorkspace, fileTreeRefreshVersion, loadAllRepoFiles]);

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
