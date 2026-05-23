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
  createOperationId,
  getFileOperationErrorMessage,
  mapIgnoredWorkspaceEntryPaths,
  mapWorkspaceEntryPaths,
} from "./fileTreeHelpers";
import { normalizeRelativePath } from "./fileTreePathHelpers";
import { useFileTreeClipboard } from "./useFileTreeClipboard";
import { useFileTreeCrud } from "./useFileTreeCrud";
import { useFileTreeUndo, type FileTreeUndoAction } from "./useFileTreeUndo";

function mergeWorkspaceEntries(current: WorkspaceFileEntry[], incoming: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  const mergedByPath = new Map<string, WorkspaceFileEntry>();

  for (const entry of current) {
    mergedByPath.set(entry.path, entry);
  }

  for (const entry of incoming) {
    mergedByPath.set(entry.path, entry);
  }

  return [...mergedByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function isPathWithinOrEqual(path: string, candidateParentPath: string): boolean {
  return path === candidateParentPath || path.startsWith(`${candidateParentPath}/`);
}

function buildNormalizedPathSet(entries: WorkspaceFileEntry[]): Set<string> {
  const normalizedPaths = new Set<string>();
  for (const entry of entries) {
    const normalizedEntryPath = normalizeRelativePath(entry.path);
    if (!normalizedEntryPath) {
      continue;
    }

    normalizedPaths.add(normalizedEntryPath);
  }

  return normalizedPaths;
}

function isMissingWorkspacePathError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("no such file or directory") && message.includes("stat ");
}

type FileOperationState = {
  operationId: string;
  workspaceWorktreePath: string;
  mode: "copy" | "move" | "import";
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  currentPath?: string;
};

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
  const [fileOperationState, setFileOperationState] = useState<FileOperationState | null>(null);
  const [fileOperationError, setFileOperationError] = useState<string | null>(null);
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

            for (const incomingPath of normalizedIncomingPathSet) {
              if (isPathWithinOrEqual(incomingPath, loadedDirectoryPath)) {
                return false;
              }
            }

            if (normalizedIncomingPathSet.has(loadedDirectoryPath)) {
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
        setRepoEntries((currentEntries) => mergeWorkspaceEntries(currentEntries, response.files));
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
    setFileOperationState(null);
    setFileOperationError(null);
    setClipboardState(null);
    setUndoStack([]);
    setFileTreeSelectionRequest(null);
    loadedDirectoryPathsRef.current = new Set<string>();
  }, [selectedWorkspaceId, selectedWorkspaceWorktreePath]);

  const beginFileOperation = useCallback(
    (mode: FileOperationState["mode"]) => {
      const operationId = createOperationId();
      setFileOperationError(null);
      setFileOperationState({
        operationId,
        workspaceWorktreePath: selectedWorkspaceWorktreePath ?? "",
        mode,
        status: "running",
        processed: 0,
        total: 1,
      });

      return operationId;
    },
    [selectedWorkspaceWorktreePath],
  );

  const completeFileOperation = useCallback((operationId: string): void => {
    setFileOperationState((currentState) => {
      if (!currentState || currentState.operationId !== operationId) {
        return currentState;
      }

      return {
        ...currentState,
        status: "completed",
        processed: 1,
        total: 1,
      };
    });
  }, []);

  const failFileOperation = useCallback(
    (operationId: string, error: unknown): void => {
      setFileOperationState((currentState) => {
        if (!currentState || currentState.operationId !== operationId) {
          return currentState;
        }

        return {
          ...currentState,
          status: "failed",
        };
      });
      setFileOperationError(getFileOperationErrorMessage(error));
    },
    [],
  );

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
