import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalAppId, SYSTEM_FILE_MANAGER_APP_ID } from "../../../../shared/contracts/externalApps";
import type { ExternalClipboardReadOutcome, WorkspaceFileEntry } from "../../../../shared/contracts/rpcRequestTypes";
import { extractPathsFromClipboardText } from "../../../../shared/fileClipboardPaths";
import {
  createFile,
  createFolder,
  deleteEntry,
  importEntries,
  importFilePayloads,
  listFiles,
  listFilesBatch,
  openEntryInExternalApp,
  pasteEntries,
  readExternalClipboardSourcePaths as readExternalClipboardSourcePathsFromRpc,
  readFile,
  renameEntry,
} from "../../../commands/fileCommands";
import { useCommands } from "../../../hooks/useCommands";
import { tabStore } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";
import {
  type ClipboardFilePayload,
  DEFAULT_CLIPBOARD_SOURCE_RESOLVERS,
  type FileTreeClipboardState,
  resolveClipboardSource,
} from "./clipboardSourceResolvers";
import {
  type FileTreeMoveUndoEntry,
  buildMoveUndoEntries,
  normalizeRelativePath,
  resolvePreferredImportedPath,
} from "./fileTreePathHelpers";
import { isDeletedPathDirectory, resolveTabIdsToCloseAfterDelete } from "./rightPaneDelete";

type FileTreeUndoAction =
  | { kind: "create-file"; path: string }
  | { kind: "create-folder"; path: string }
  | { kind: "rename"; fromPath: string; toPath: string }
  | { kind: "move"; entries: FileTreeMoveUndoEntry[] }
  | { kind: "delete-file"; path: string; content: string };

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
  loadedDirectoryPaths: string[];
  searchRepoFiles: string[];
  searchIgnoredRepoPaths: string[];
  fileOperationState: FileOperationState | null;
  fileOperationError: string | null;
  fileTreeSelectionRequest: FileTreeSelectionRequest | null;
  canPasteEntries: boolean;
  canUndoLastEntryOperation: boolean;
  revealFileInTree: (path: string | null) => void;
  ensureDirectoryLoaded: (path: string) => Promise<void>;
  loadExpandedDirectory: (path: string) => Promise<void>;
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
  onRefresh: () => Promise<void>;
  onUndoLastEntryOperation: () => Promise<void>;
};

type WorkspaceTreeCacheEntry = {
  repoEntries: WorkspaceFileEntry[];
  loadedDirectoryPaths: string[];
  allRepoEntries: WorkspaceFileEntry[] | null;
};

export const CONTEXT_DIRECTORY_PATHS = [".my-context"];
const EMPTY_CHANGED_RELATIVE_PATHS: string[] = [];
const INVALID_DIRECTORY_LIST_PATH_ERROR_MESSAGE = "relativePath must point to a directory under rootPath";

function isContextDirectoryPath(path: string): boolean {
  const normalizedPath = normalizeRelativePath(path).replace(/\/+$/, "");
  return CONTEXT_DIRECTORY_PATHS.includes(normalizedPath);
}

/** Resolves an absolute path by joining worktree root and relative file path. */
function resolveWorkspaceAbsolutePath(worktreePath: string, relativePath: string): string {
  const trimmedRoot = worktreePath.replace(/\/+$/, "");
  const trimmedRelative = relativePath.replace(/^\/+/, "");
  return `${trimmedRoot}/${trimmedRelative}`;
}

/** Returns a consistent user-visible error message for file tree operations. */
function getFileOperationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/** Returns true when one file-list error indicates a stale or invalid directory request path. */
function isInvalidDirectoryListPathError(errorMessage: string): boolean {
  return errorMessage.includes(INVALID_DIRECTORY_LIST_PATH_ERROR_MESSAGE);
}

/** Creates a stable operation id in both browser and test environments. */
function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Returns sorted repo-relative paths from file service entries for stable tree rendering. */
function mapWorkspaceEntryPaths(entries: WorkspaceFileEntry[]): string[] {
  return entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
}

/** Returns sorted ignored repo-relative paths from file service entries for stable tree rendering. */
function mapIgnoredWorkspaceEntryPaths(entries: WorkspaceFileEntry[]): string[] {
  return entries
    .filter((entry) => entry.isIgnored)
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));
}

/** Merges one lazy-loaded directory listing into the current tree entry cache. */
function mergeWorkspaceEntries(
  currentEntries: WorkspaceFileEntry[],
  nextEntries: WorkspaceFileEntry[],
): WorkspaceFileEntry[] {
  const entriesByPath = new Map(currentEntries.map((entry) => [entry.path, entry]));
  for (const entry of nextEntries) {
    entriesByPath.set(entry.path, entry);
  }

  return [...entriesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** Returns true when one workspace-relative path is a direct child of the provided directory path. */
function isDirectChildPath(directoryPath: string, candidatePath: string): boolean {
  const normalizedDirectoryPath = directoryPath.replace(/\/+$/, "");
  const normalizedCandidatePath = candidatePath.replace(/\/+$/, "");
  const candidateParts = normalizedCandidatePath.split("/").filter(Boolean);
  const directoryParts = normalizedDirectoryPath.split("/").filter(Boolean);

  if (candidateParts.length !== directoryParts.length + 1) {
    return false;
  }

  return directoryParts.every((segment, index) => candidateParts[index] === segment);
}

/** Replaces one directory's visible direct children while preserving loaded descendants that still exist. */
function replaceDirectoryEntries(
  currentEntries: WorkspaceFileEntry[],
  directoryPath: string,
  nextEntries: WorkspaceFileEntry[],
): { entries: WorkspaceFileEntry[]; removedPaths: string[] } {
  const nextDirectChildPaths = new Set(
    nextEntries.map((entry) => entry.path.replace(/\/+$/, "")).filter((path) => isDirectChildPath(directoryPath, path)),
  );
  const removedPaths = currentEntries
    .map((entry) => entry.path.replace(/\/+$/, ""))
    .filter((path) => isDirectChildPath(directoryPath, path) && !nextDirectChildPaths.has(path));

  const preservedEntries = currentEntries.filter((entry) => {
    const normalizedPath = entry.path.replace(/\/+$/, "");
    if (nextDirectChildPaths.has(normalizedPath)) {
      return false;
    }

    return !removedPaths.some(
      (removedPath) => normalizedPath === removedPath || normalizedPath.startsWith(`${removedPath}/`),
    );
  });

  return {
    entries: mergeWorkspaceEntries(preservedEntries, nextEntries),
    removedPaths,
  };
}

/** Removes loaded directory markers for directory paths that were removed from the tree. */
function filterRemovedLoadedDirectoryPaths(currentPaths: string[], removedPaths: string[]): string[] {
  return currentPaths.filter(
    (path) => !removedPaths.some((removedPath) => path === removedPath || path.startsWith(`${removedPath}/`)),
  );
}

/** Removes directory subtrees from one tree entry list for invalidated directory requests. */
function removeDirectorySubtreeEntries(
  entries: WorkspaceFileEntry[],
  removedDirectoryPaths: string[],
): WorkspaceFileEntry[] {
  const normalizedRemovedPaths = removedDirectoryPaths
    .map((path) => path.replace(/\/+$/, ""))
    .filter((path) => path.length > 0);
  if (normalizedRemovedPaths.length === 0) {
    return entries;
  }

  return entries.filter((entry) => {
    const normalizedEntryPath = entry.path.replace(/\/+$/, "");
    return !normalizedRemovedPaths.some(
      (removedPath) => normalizedEntryPath === removedPath || normalizedEntryPath.startsWith(`${removedPath}/`),
    );
  });
}

/** Returns direct child entries already present under one directory path in the visible tree cache. */
function collectDirectChildEntries(entries: WorkspaceFileEntry[], directoryPath: string): WorkspaceFileEntry[] {
  return entries.filter((entry) => isDirectChildPath(directoryPath, entry.path.replace(/\/+$/, "")));
}

/** Returns direct child directory paths under one directory path, capped for background preloading. */
function collectDirectChildDirectoryPaths(entries: WorkspaceFileEntry[], directoryPath: string): string[] {
  return entries
    .filter(
      (entry) =>
        !entry.isIgnored &&
        entry.path.endsWith("/") &&
        !isContextDirectoryPath(entry.path) &&
        isDirectChildPath(directoryPath, entry.path.replace(/\/+$/, "")),
    )
    .map((entry) => entry.path.replace(/\/+$/, ""));
}

/** Collects ancestor directory paths that must be loaded for one target path to become visible. */
function collectDirectoryChainForPath(path: string): string[] {
  const normalizedPath = normalizeRelativePath(path).replace(/\/+$/, "");
  const parts = normalizedPath.split("/").filter(Boolean);
  const directoryCount = path.endsWith("/") ? parts.length : Math.max(parts.length - 1, 0);
  const directoryPaths = [""];

  for (let index = 0; index < directoryCount; index += 1) {
    directoryPaths.push(parts.slice(0, index + 1).join("/"));
  }

  return directoryPaths;
}

/** Converts one ArrayBuffer payload to base64 without relying on Node-specific globals. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/** Maps one clipboard MIME type to a best-effort file extension for payload import. */
function resolveExtensionFromMimeType(mimeType: string): string {
  const normalizedType = mimeType.toLowerCase();

  if (normalizedType === "image/png") {
    return "png";
  }

  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") {
    return "jpg";
  }

  if (normalizedType === "image/gif") {
    return "gif";
  }

  if (normalizedType === "image/webp") {
    return "webp";
  }

  if (normalizedType === "image/svg+xml") {
    return "svg";
  }

  if (normalizedType === "application/pdf") {
    return "pdf";
  }

  const slashIndex = normalizedType.indexOf("/");
  if (slashIndex < 0 || slashIndex === normalizedType.length - 1) {
    return "bin";
  }

  return normalizedType.slice(slashIndex + 1).replace(/[^a-z0-9]/g, "") || "bin";
}

/** Reads binary clipboard blobs from browser clipboard APIs and converts them into importable payloads. */
async function resolveExternalClipboardFilePayloads(): Promise<ClipboardFilePayload[]> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") {
    return [];
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const filePayloads: ClipboardFilePayload[] = [];
    let payloadIndex = 1;

    for (const clipboardItem of clipboardItems) {
      for (const type of clipboardItem.types) {
        const normalizedType = type.toLowerCase();
        const isBinaryPayload = normalizedType.startsWith("image/") || normalizedType === "application/pdf";
        if (!isBinaryPayload) {
          continue;
        }

        const blob = await clipboardItem.getType(type);
        if (blob.size === 0) {
          continue;
        }

        const extension = resolveExtensionFromMimeType(blob.type || type);
        const relativePath = `pasted-${payloadIndex}.${extension}`;
        payloadIndex += 1;

        filePayloads.push({
          relativePath,
          contentBase64: arrayBufferToBase64(await blob.arrayBuffer()),
        });
      }
    }

    return filePayloads;
  } catch (error) {
    console.warn("Failed to read clipboard file payloads for external file paste", error);
    return [];
  }
}

/** Reports one native clipboard outcome so telemetry hooks can consume deterministic event states. */
function reportNativeExternalClipboardOutcome(outcome: ExternalClipboardReadOutcome): void {
  if (outcome.kind === "success") {
    console.info("Native external clipboard read succeeded", {
      strategy: outcome.strategy,
      sourcePathCount: outcome.sourcePaths.length,
      clipboardFormats: outcome.clipboardFormats,
    });
    return;
  }

  if (outcome.kind === "supported" || outcome.kind === "empty") {
    console.info("Native external clipboard read produced no source paths", {
      kind: outcome.kind,
      strategy: outcome.strategy,
      clipboardFormats: outcome.clipboardFormats,
    });
    return;
  }

  console.warn("Native external clipboard read failed", {
    kind: outcome.kind,
    strategy: outcome.strategy,
    clipboardFormats: outcome.clipboardFormats,
    message: "message" in outcome ? outcome.message : undefined,
  });
}

/** Handles file-tree operations and state for the active workspace. */
export function useFileTreeOperations(): UseFileTreeOperationsResult {
  const { t } = useTranslation();
  const [repoEntries, setRepoEntries] = useState<WorkspaceFileEntry[]>([]);
  const [allRepoEntries, setAllRepoEntries] = useState<WorkspaceFileEntry[] | null>(null);
  const [loadedDirectoryPaths, setLoadedDirectoryPaths] = useState<string[]>([]);
  const [clipboardState, setClipboardState] = useState<FileTreeClipboardState | null>(null);
  const [fileOperationState, setFileOperationState] = useState<FileOperationState | null>(null);
  const [fileOperationError, setFileOperationError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<FileTreeUndoAction[]>([]);
  const [fileTreeSelectionRequest, setFileTreeSelectionRequest] = useState<FileTreeSelectionRequest | null>(null);
  const repoEntriesRef = useRef<WorkspaceFileEntry[]>([]);
  const loadedDirectoryPathsRef = useRef<string[]>([]);
  const selectedWorkspaceWorktreePathRef = useRef<string | undefined>(undefined);
  const directoryLoadPromiseByPathRef = useRef(new Map<string, Promise<WorkspaceFileEntry[]>>());
  const treeCacheByWorkspaceIdRef = useRef(new Map<string, WorkspaceTreeCacheEntry>());
  const activeOperationIdRef = useRef<string | null>(null);
  const isApplyingUndoRef = useRef(false);
  const isDeletingEntryRef = useRef(false);
  const isExternalImportInFlightRef = useRef(false);
  const fileTreeSelectionRequestIdRef = useRef(0);
  const clipboardStateRequestIdRef = useRef(0);
  const allRepoFilesLoadRequestIdRef = useRef(0);

  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
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
  const { openTab, closeTab, setLastUsedExternalAppId } = useCommands();
  const tabs = tabStore((state) => state.tabs);
  const repoFiles = useMemo(() => mapWorkspaceEntryPaths(repoEntries), [repoEntries]);
  const ignoredRepoPaths = useMemo(() => mapIgnoredWorkspaceEntryPaths(repoEntries), [repoEntries]);
  const searchRepoFiles = useMemo(() => mapWorkspaceEntryPaths(allRepoEntries ?? []), [allRepoEntries]);
  const searchIgnoredRepoPaths = useMemo(() => mapIgnoredWorkspaceEntryPaths(allRepoEntries ?? []), [allRepoEntries]);

  selectedWorkspaceWorktreePathRef.current = selectedWorkspaceWorktreePath;

  useEffect(() => {
    repoEntriesRef.current = repoEntries;
  }, [repoEntries]);

  useEffect(() => {
    loadedDirectoryPathsRef.current = loadedDirectoryPaths;
  }, [loadedDirectoryPaths]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    treeCacheByWorkspaceIdRef.current.set(selectedWorkspaceId, {
      repoEntries,
      loadedDirectoryPaths,
      allRepoEntries,
    });
  }, [allRepoEntries, loadedDirectoryPaths, repoEntries, selectedWorkspaceId]);

  /** Loads one directory's direct children once and reuses in-flight requests for duplicate callers. */
  const loadDirectoryEntries = useCallback(
    async (directoryPath: string, forceReload = false) => {
      const normalizedDirectoryPath = normalizeRelativePath(directoryPath).replace(/\/+$/, "");
      if (!selectedWorkspaceWorktreePath) {
        setRepoEntries([]);
        setLoadedDirectoryPaths([]);
        return [];
      }

      if (!forceReload && loadedDirectoryPathsRef.current.includes(normalizedDirectoryPath)) {
        return collectDirectChildEntries(repoEntriesRef.current, normalizedDirectoryPath);
      }

      const existingPromise = directoryLoadPromiseByPathRef.current.get(normalizedDirectoryPath);
      if (existingPromise) {
        return existingPromise;
      }

      const currentWorktreePath = selectedWorkspaceWorktreePath;
      const loadPromise = listFiles({
        workspaceWorktreePath: currentWorktreePath,
        relativePath: normalizedDirectoryPath || undefined,
        recursive: false,
      })
        .then((response) => {
          if (selectedWorkspaceWorktreePathRef.current !== currentWorktreePath) {
            return [];
          }

          setRepoEntries((currentEntries) => {
            const nextDirectoryState = replaceDirectoryEntries(currentEntries, normalizedDirectoryPath, response.files);

            setLoadedDirectoryPaths((currentPaths) => {
              const nextPaths = filterRemovedLoadedDirectoryPaths(currentPaths, nextDirectoryState.removedPaths);
              return nextPaths.includes(normalizedDirectoryPath) ? nextPaths : [...nextPaths, normalizedDirectoryPath];
            });

            return nextDirectoryState.entries;
          });

          return response.files;
        })
        .catch((error) => {
          console.error("Failed to load workspace directory entries", error);
          return [];
        })
        .finally(() => {
          directoryLoadPromiseByPathRef.current.delete(normalizedDirectoryPath);
        });

      directoryLoadPromiseByPathRef.current.set(normalizedDirectoryPath, loadPromise);
      return loadPromise;
    },
    [selectedWorkspaceWorktreePath],
  );

  /**
   * Loads multiple directories in one backend batch call and updates the local lazy tree cache.
   */
  const loadDirectoryEntriesBatch = useCallback(
    async (directoryPaths: string[], forceReload = false): Promise<void> => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const normalizedDirectoryPaths = [
        ...new Set(directoryPaths.map((path) => normalizeRelativePath(path).replace(/\/+$/, ""))),
      ];
      const directoriesToRequest = normalizedDirectoryPaths.filter((directoryPath) => {
        if (forceReload) {
          return true;
        }

        return !loadedDirectoryPathsRef.current.includes(directoryPath);
      });

      if (directoriesToRequest.length === 0) {
        return;
      }

      const currentWorktreePath = selectedWorkspaceWorktreePath;
      try {
        const response = await listFilesBatch({
          workspaceWorktreePath: currentWorktreePath,
          requests: directoriesToRequest.map((relativePath) => ({
            relativePath: relativePath || undefined,
            recursive: false,
          })),
        });

        if (selectedWorkspaceWorktreePathRef.current !== currentWorktreePath) {
          return;
        }

        const filesByDirectoryPath = new Map<string, WorkspaceFileEntry[]>();
        const invalidDirectoryPaths = new Set<string>();
        const successfulDirectoryPaths = new Set<string>();
        for (const result of response.results) {
          const normalizedDirectoryPath = normalizeRelativePath(result.request.relativePath ?? "").replace(/\/+$/, "");
          const resultError = typeof (result as { error?: unknown }).error === "string" ? result.error.trim() : "";
          if (resultError) {
            if (normalizedDirectoryPath && isInvalidDirectoryListPathError(resultError)) {
              // Drop stale directory markers so refresh no longer retries the same
              // invalid path forever (e.g. deleted/generated build folders).
              invalidDirectoryPaths.add(normalizedDirectoryPath);
              continue;
            }

            console.error("Failed to load workspace directory entry from batch response", {
              directoryPath: normalizedDirectoryPath,
              error: resultError,
            });
            continue;
          }

          filesByDirectoryPath.set(normalizedDirectoryPath, result.files);
          successfulDirectoryPaths.add(normalizedDirectoryPath);
        }

        setRepoEntries((currentEntries) => {
          let nextEntries = removeDirectorySubtreeEntries(currentEntries, [...invalidDirectoryPaths]);
          const removedPaths = new Set<string>();

          for (const directoryPath of directoriesToRequest) {
            const files = filesByDirectoryPath.get(directoryPath);
            if (!files) {
              continue;
            }

            const nextDirectoryState = replaceDirectoryEntries(nextEntries, directoryPath, files);
            nextEntries = nextDirectoryState.entries;
            for (const removedPath of nextDirectoryState.removedPaths) {
              removedPaths.add(removedPath);
            }
          }

          setLoadedDirectoryPaths((currentPaths) => {
            const nextPaths = filterRemovedLoadedDirectoryPaths(currentPaths, [
              ...removedPaths,
              ...invalidDirectoryPaths,
            ]);
            const pathSet = new Set(nextPaths);
            for (const directoryPath of successfulDirectoryPaths) {
              pathSet.add(directoryPath);
            }

            return [...pathSet];
          });

          return nextEntries;
        });
      } catch (error) {
        console.error("Failed to load workspace directory entries batch", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  /** Preloads direct child directories for one branch without cascading beyond one additional level. */
  const preloadDirectories = useCallback(
    async (directoryPaths: string[]): Promise<void> => {
      const uniqueDirectoryPaths = [...new Set(directoryPaths)].filter(
        (directoryPath) => !loadedDirectoryPathsRef.current.includes(directoryPath),
      );

      await loadDirectoryEntriesBatch(uniqueDirectoryPaths.slice(0, 12));
    },
    [loadDirectoryEntriesBatch],
  );

  /** Loads one directory for the visible tree and merges it into the current lazy tree cache. */
  const ensureDirectoryLoaded = useCallback(
    async (directoryPath: string): Promise<void> => {
      await loadDirectoryEntries(directoryPath);
    },
    [loadDirectoryEntries],
  );

  /** Loads one expanded directory and preloads one additional visible level beneath it. */
  const loadExpandedDirectory = useCallback(
    async (directoryPath: string): Promise<void> => {
      const normalizedDirectoryPath = normalizeRelativePath(directoryPath).replace(/\/+$/, "");
      const shouldForceReload = isContextDirectoryPath(normalizedDirectoryPath);
      const directChildEntries =
        !shouldForceReload && loadedDirectoryPathsRef.current.includes(normalizedDirectoryPath)
          ? collectDirectChildEntries(repoEntriesRef.current, normalizedDirectoryPath)
          : await loadDirectoryEntries(normalizedDirectoryPath, shouldForceReload);

      void preloadDirectories(collectDirectChildDirectoryPaths(directChildEntries, normalizedDirectoryPath));
    },
    [loadDirectoryEntries, preloadDirectories],
  );

  /** Loads the full workspace file list for search and path-diff operations. */
  const loadAllRepoFiles = useCallback(async (): Promise<string[]> => {
    allRepoFilesLoadRequestIdRef.current += 1;
    const requestId = allRepoFilesLoadRequestIdRef.current;

    if (!selectedWorkspaceWorktreePath) {
      setAllRepoEntries([]);
      return [];
    }

    try {
      const response = await listFiles({
        workspaceWorktreePath: selectedWorkspaceWorktreePath,
      });
      if (allRepoFilesLoadRequestIdRef.current !== requestId) {
        return [];
      }

      setAllRepoEntries(response.files);
      return mapWorkspaceEntryPaths(response.files);
    } catch (error) {
      if (allRepoFilesLoadRequestIdRef.current !== requestId) {
        return [];
      }

      setAllRepoEntries([]);
      console.error("Failed to load workspace workspace files", error);
      return [];
    }
  }, [selectedWorkspaceWorktreePath]);

  /** Refreshes root-level tree entries without clearing the current visible tree first. */
  const reloadVisibleTree = useCallback(
    async (
      input: {
        reloadLoadedDirectories?: boolean;
        reloadContextDirectories?: boolean;
        changedRelativePaths?: string[];
        preferTargetedReload?: boolean;
      } = {},
    ): Promise<string[]> => {
      const isTargetedRefresh = input.preferTargetedReload === true;
      if (!selectedWorkspaceWorktreePath) {
        return [];
      }

      if (isTargetedRefresh && input.changedRelativePaths && input.changedRelativePaths.length > 0) {
        const loadedDirectoryPathSet = new Set(loadedDirectoryPathsRef.current);
        const directoryPathsToReload = new Set<string>();

        for (const changedRelativePath of input.changedRelativePaths) {
          for (const directoryPath of collectDirectoryChainForPath(changedRelativePath)) {
            if (directoryPath.length === 0 || loadedDirectoryPathSet.has(directoryPath)) {
              directoryPathsToReload.add(directoryPath);
            }
          }
        }

        if (input.reloadContextDirectories) {
          for (const contextDirectoryPath of CONTEXT_DIRECTORY_PATHS) {
            if (loadedDirectoryPathSet.has(contextDirectoryPath)) {
              directoryPathsToReload.add(contextDirectoryPath);
            }
          }
        }

        if (directoryPathsToReload.size > 0) {
          await loadDirectoryEntriesBatch([...directoryPathsToReload], true);
          return [];
        }
      }

      setAllRepoEntries(null);

      try {
        const response = await listFiles({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          recursive: false,
        });
        const nextVisibleTreeState = replaceDirectoryEntries(repoEntriesRef.current, "", response.files);
        setRepoEntries(nextVisibleTreeState.entries);
        setLoadedDirectoryPaths((currentPaths) => {
          const nextPaths = filterRemovedLoadedDirectoryPaths(currentPaths, nextVisibleTreeState.removedPaths);
          return nextPaths.includes("") ? nextPaths : ["", ...nextPaths];
        });
        if (!isTargetedRefresh) {
          void preloadDirectories(collectDirectChildDirectoryPaths(response.files, ""));
        }

        if (input.reloadLoadedDirectories && !isTargetedRefresh) {
          const loadedDirectoryPaths = loadedDirectoryPathsRef.current.filter((path) => path.length > 0);
          await loadDirectoryEntriesBatch(loadedDirectoryPaths, true);
        }

        if (input.reloadContextDirectories && !isTargetedRefresh) {
          await loadDirectoryEntriesBatch(CONTEXT_DIRECTORY_PATHS, true);
        }

        if (input.changedRelativePaths && input.changedRelativePaths.length > 0) {
          const directoryPathsToReload = new Set<string>();
          for (const changedRelativePath of input.changedRelativePaths) {
            for (const directoryPath of collectDirectoryChainForPath(changedRelativePath)) {
              if (directoryPath.length > 0) {
                directoryPathsToReload.add(directoryPath);
              }
            }
          }

          await loadDirectoryEntriesBatch([...directoryPathsToReload], true);
        }

        return mapWorkspaceEntryPaths(response.files);
      } catch (error) {
        console.error("Failed to refresh visible workspace tree", error);
        return [];
      }
    },
    [loadDirectoryEntriesBatch, preloadDirectories, selectedWorkspaceWorktreePath],
  );

  /** Loads every ancestor directory needed to reveal one tree path. */
  const ensurePathLoaded = useCallback(
    async (path: string): Promise<void> => {
      for (const directoryPath of collectDirectoryChainForPath(path)) {
        await ensureDirectoryLoaded(directoryPath);
      }
    },
    [ensureDirectoryLoaded],
  );

  useEffect(() => {
    const shouldPreferTargetedReload = changedRelativePathsForSelectedWorkspace.length > 0;
    void fileTreeRefreshVersion;
    void reloadVisibleTree({
      changedRelativePaths: shouldPreferTargetedReload ? changedRelativePathsForSelectedWorkspace : undefined,
      preferTargetedReload: shouldPreferTargetedReload,
    });
  }, [changedRelativePathsForSelectedWorkspace, fileTreeRefreshVersion, reloadVisibleTree]);

  useEffect(() => {
    void selectedWorkspaceWorktreePath;
    activeOperationIdRef.current = null;
    const cachedTreeState = selectedWorkspaceId ? treeCacheByWorkspaceIdRef.current.get(selectedWorkspaceId) : null;
    setRepoEntries(cachedTreeState?.repoEntries ?? []);
    setAllRepoEntries(cachedTreeState?.allRepoEntries ?? null);
    setLoadedDirectoryPaths(cachedTreeState?.loadedDirectoryPaths ?? []);
    directoryLoadPromiseByPathRef.current.clear();
    setFileOperationState(null);
    setFileOperationError(null);
    setClipboardState(null);
    setUndoStack([]);
    setFileTreeSelectionRequest(null);
    isDeletingEntryRef.current = false;
  }, [selectedWorkspaceId, selectedWorkspaceWorktreePath]);

  const beginFileOperation = useCallback(
    (mode: FileOperationState["mode"]) => {
      const operationId = createOperationId();
      activeOperationIdRef.current = operationId;
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

  /** Marks one active file operation as completed and clears active operation tracking. */
  const completeFileOperation = useCallback((operationId: string): void => {
    if (activeOperationIdRef.current !== operationId) {
      return;
    }

    activeOperationIdRef.current = null;
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

  /** Marks one active file operation as failed, records a visible error message, and clears active tracking. */
  const failFileOperation = useCallback(
    (operationId: string, error: unknown): void => {
      if (activeOperationIdRef.current !== operationId) {
        return;
      }

      activeOperationIdRef.current = null;
      setFileOperationState((currentState) => {
        if (!currentState || currentState.operationId !== operationId) {
          return currentState;
        }

        return {
          ...currentState,
          status: "failed",
        };
      });
      setFileOperationError(getFileOperationErrorMessage(error) || t("files.operations.failed"));
    },
    [t],
  );

  /** Requests one tree selection update for the next render cycle. */
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

  /** Opens one file path in the active workspace, with optional temporary preview-tab behavior. */
  const openWorkspaceFile = useCallback(
    async (path: string, options?: { temporary?: boolean }) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        const response = await readFile({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: path,
        });

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "file",
          path,
          content: response.content,
          temporary: Boolean(options?.temporary),
        });
        requestFileTreeSelection(path, false);
      } catch (error) {
        console.error("Failed to load workspace workspace file", error);
      }
    },
    [openTab, requestFileTreeSelection, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  /** Starts one external import lock so repeated paste/drop events do not overlap. */
  const beginExternalImportLock = useCallback((): boolean => {
    if (isExternalImportInFlightRef.current) {
      return false;
    }

    isExternalImportInFlightRef.current = true;
    return true;
  }, []);

  /** Releases the external import lock when one operation finishes. */
  const endExternalImportLock = useCallback((): void => {
    isExternalImportInFlightRef.current = false;
  }, []);

  /** Reads one native external clipboard path snapshot for internal copy/cut precedence decisions. */
  const captureNativeExternalClipboardSourcePathsSnapshot = useCallback(async (): Promise<string[] | null> => {
    try {
      const nativeClipboardResult = await readExternalClipboardSourcePathsFromRpc();
      reportNativeExternalClipboardOutcome(nativeClipboardResult);
      if (nativeClipboardResult.kind === "success") {
        return nativeClipboardResult.sourcePaths;
      }

      if (nativeClipboardResult.kind === "supported" || nativeClipboardResult.kind === "empty") {
        return [];
      }

      return null;
    } catch (error) {
      console.warn("Failed to capture native clipboard snapshot for internal file-tree clipboard", error);
      return null;
    }
  }, []);

  /** Sets internal clipboard state immediately and backfills native external snapshot asynchronously. */
  const setInternalClipboardState = useCallback(
    (mode: "copy" | "move", path: string): void => {
      clipboardStateRequestIdRef.current += 1;
      const requestId = clipboardStateRequestIdRef.current;
      setClipboardState({
        requestId,
        mode,
        sourcePaths: [path],
        externalClipboardSnapshotSourcePaths: null,
      });

      void (async () => {
        const externalClipboardSnapshotSourcePaths = await captureNativeExternalClipboardSourcePathsSnapshot();
        setClipboardState((currentState) => {
          if (!currentState || currentState.requestId !== requestId) {
            return currentState;
          }

          return {
            ...currentState,
            externalClipboardSnapshotSourcePaths,
          };
        });
      })();
    },
    [captureNativeExternalClipboardSourcePathsSnapshot],
  );

  /** Resolves external clipboard source paths from native RPC first, then browser clipboard APIs as fallback. */
  const resolveExternalClipboardSourcePaths = useCallback(async (): Promise<{
    sourcePaths: string[];
    nativeOutcome: ExternalClipboardReadOutcome | null;
  }> => {
    const sourcePathSet = new Set<string>();
    let nativeOutcome: ExternalClipboardReadOutcome | null = null;

    try {
      nativeOutcome = await readExternalClipboardSourcePathsFromRpc();
      reportNativeExternalClipboardOutcome(nativeOutcome);
      if (nativeOutcome.kind === "success") {
        for (const sourcePath of nativeOutcome.sourcePaths) {
          sourcePathSet.add(sourcePath);
        }
      }
    } catch (error) {
      console.warn("Failed to read native clipboard paths for external file paste", error);
    }

    if (sourcePathSet.size > 0) {
      return {
        sourcePaths: [...sourcePathSet],
        nativeOutcome,
      };
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return {
        sourcePaths: [],
        nativeOutcome,
      };
    }

    if (typeof navigator.clipboard.read === "function") {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          for (const type of clipboardItem.types) {
            const normalizedType = type.toLowerCase();
            const shouldAttemptTextExtraction =
              normalizedType.startsWith("text/") ||
              normalizedType.includes("uri") ||
              normalizedType.includes("file-url") ||
              normalizedType.includes("utf8-plain-text");
            if (!shouldAttemptTextExtraction) {
              continue;
            }

            const blob = await clipboardItem.getType(type);
            const text = await blob.text();
            const paths = extractPathsFromClipboardText(text);
            for (const path of paths) {
              sourcePathSet.add(path);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to read clipboard items for external file paste", error);
      }
    }

    if (sourcePathSet.size === 0 && typeof navigator.clipboard.readText === "function") {
      try {
        const text = await navigator.clipboard.readText();
        const paths = extractPathsFromClipboardText(text);
        for (const path of paths) {
          sourcePathSet.add(path);
        }
      } catch (error) {
        console.warn("Failed to read clipboard text for external file paste", error);
      }
    }

    return {
      sourcePaths: [...sourcePathSet],
      nativeOutcome,
    };
  }, []);

  /** Pushes one reversible file-tree action onto a bounded local undo stack. */
  const pushUndoAction = useCallback((action: FileTreeUndoAction) => {
    if (isApplyingUndoRef.current) {
      return;
    }

    setUndoStack((currentStack) => [action, ...currentStack].slice(0, 30));
  }, []);

  /** Applies the most recent reversible file-tree action when available. */
  const handleUndoLastFileTreeOperation = useCallback(async () => {
    if (isApplyingUndoRef.current) {
      return;
    }

    const latestUndoAction = undoStack[0];
    if (!latestUndoAction || !selectedWorkspaceWorktreePath) {
      return;
    }

    try {
      isApplyingUndoRef.current = true;
      setFileOperationError(null);

      switch (latestUndoAction.kind) {
        case "create-file": {
          await deleteEntry({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            relativePath: latestUndoAction.path,
          });

          const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, latestUndoAction.path, false);
          for (const tabId of tabIdsToClose) {
            closeTab(tabId);
          }
          break;
        }
        case "create-folder": {
          await deleteEntry({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            relativePath: latestUndoAction.path,
          });

          const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, latestUndoAction.path, true);
          for (const tabId of tabIdsToClose) {
            closeTab(tabId);
          }
          break;
        }
        case "rename": {
          await renameEntry({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            fromRelativePath: latestUndoAction.toPath,
            toRelativePath: latestUndoAction.fromPath,
          });
          break;
        }
        case "move": {
          const reverseEntries = [...latestUndoAction.entries].sort(
            (leftEntry, rightEntry) => rightEntry.toPath.length - leftEntry.toPath.length,
          );

          for (const reverseEntry of reverseEntries) {
            await renameEntry({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              fromRelativePath: reverseEntry.toPath,
              toRelativePath: reverseEntry.fromPath,
            });
          }
          break;
        }
        case "delete-file": {
          await createFile({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            relativePath: latestUndoAction.path,
            content: latestUndoAction.content,
          });
          break;
        }
        default: {
          const exhaustiveCheck: never = latestUndoAction;
          return exhaustiveCheck;
        }
      }

      await reloadVisibleTree();
      setUndoStack((currentStack) => currentStack.slice(1));
    } catch (error) {
      setFileOperationError(getFileOperationErrorMessage(error));
      console.error("Failed to undo file tree operation", error);
    } finally {
      isApplyingUndoRef.current = false;
    }
  }, [closeTab, reloadVisibleTree, selectedWorkspaceWorktreePath, tabs, undoStack]);

  /** Deletes one entry immediately and records undo state for files. */
  const handleDeleteEntry = useCallback(
    async (targetPath: string) => {
      if (!targetPath || !selectedWorkspaceWorktreePath || isDeletingEntryRef.current) {
        return;
      }

      isDeletingEntryRef.current = true;
      const targetIsDirectory = isDeletedPathDirectory(repoFiles, targetPath);

      try {
        let deleteUndoAction: FileTreeUndoAction | null = null;
        if (!targetIsDirectory) {
          try {
            const response = await readFile({
              workspaceWorktreePath: selectedWorkspaceWorktreePath,
              relativePath: targetPath,
            });

            deleteUndoAction = {
              kind: "delete-file",
              path: targetPath,
              content: response.content,
            };
          } catch (error) {
            console.warn("Failed to capture file content for undo before delete", error);
          }
        }

        await deleteEntry({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: targetPath,
        });

        const tabIdsToClose = resolveTabIdsToCloseAfterDelete(tabs, targetPath, targetIsDirectory);
        for (const tabId of tabIdsToClose) {
          closeTab(tabId);
        }

        if (deleteUndoAction) {
          pushUndoAction(deleteUndoAction);
        }

        await reloadVisibleTree();
      } catch (error) {
        console.error("Failed to delete workspace entry", error);
      } finally {
        isDeletingEntryRef.current = false;
      }
    },
    [closeTab, reloadVisibleTree, pushUndoAction, repoFiles, selectedWorkspaceWorktreePath, tabs],
  );

  const onCreateFile = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFile({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: path,
          content: "",
        });

        await reloadVisibleTree();

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "file",
          path,
          content: "",
        });
        pushUndoAction({
          kind: "create-file",
          path,
        });
      } catch (error) {
        console.error("Failed to create workspace file", error);
      }
    },
    [openTab, pushUndoAction, reloadVisibleTree, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const onCreateFolder = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await createFolder({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          relativePath: path,
        });

        pushUndoAction({
          kind: "create-folder",
          path,
        });
        await reloadVisibleTree();
      } catch (error) {
        console.error("Failed to create workspace folder", error);
      }
    },
    [pushUndoAction, reloadVisibleTree, selectedWorkspaceWorktreePath],
  );

  const onRenameEntry = useCallback(
    async (path: string, nextName: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const segments = path.split("/").filter(Boolean);
      if (segments.length === 0) {
        return;
      }

      const parentPath = segments.slice(0, -1).join("/");
      const targetPath = parentPath ? `${parentPath}/${nextName}` : nextName;

      try {
        await renameEntry({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          fromRelativePath: path,
          toRelativePath: targetPath,
        });

        pushUndoAction({
          kind: "rename",
          fromPath: path,
          toPath: targetPath,
        });
        await reloadVisibleTree();
      } catch (error) {
        console.error("Failed to rename workspace entry", error);
      }
    },
    [pushUndoAction, reloadVisibleTree, selectedWorkspaceWorktreePath],
  );

  const onCopyPath = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath || !navigator.clipboard) {
        return;
      }

      try {
        const absolutePath = resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, path);
        await navigator.clipboard.writeText(absolutePath);
      } catch (error) {
        console.error("Failed to copy workspace entry path", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const onCopyRelativePath = useCallback(async (path: string) => {
    if (!navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      console.error("Failed to copy workspace entry relative path", error);
    }
  }, []);

  const onOpenInFileManager = useCallback(
    async (path: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          appId: SYSTEM_FILE_MANAGER_APP_ID,
          relativePath: path,
        });
      } catch (error) {
        console.error("Failed to open workspace entry in file manager", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const onOpenInExternalApp = useCallback(
    async (input: { path?: string; appId: ExternalAppId }) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      try {
        await openEntryInExternalApp({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          appId: input.appId,
          relativePath: input.path?.trim() || undefined,
        });
        setLastUsedExternalAppId(input.appId);
      } catch (error) {
        console.error("Failed to open workspace entry in external app", error);
      }
    },
    [selectedWorkspaceWorktreePath, setLastUsedExternalAppId],
  );

  const onPasteEntries = useCallback(
    async (destinationPath: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const repoFilesBeforePaste = allRepoEntries ? mapWorkspaceEntryPaths(allRepoEntries) : await loadAllRepoFiles();
      const skipExternalPathRead = clipboardState?.mode === "move";
      const externalClipboardSourcePathResult = skipExternalPathRead
        ? { sourcePaths: [], nativeOutcome: null }
        : await resolveExternalClipboardSourcePaths();
      const { nativeOutcome } = externalClipboardSourcePathResult;
      const externalSourcePaths = externalClipboardSourcePathResult.sourcePaths;
      const externalFilePayloads =
        skipExternalPathRead || externalSourcePaths.length > 0 ? [] : await resolveExternalClipboardFilePayloads();

      const shouldSetExternalClipboardError =
        !skipExternalPathRead &&
        !clipboardState &&
        externalSourcePaths.length === 0 &&
        externalFilePayloads.length === 0 &&
        nativeOutcome &&
        (nativeOutcome.kind === "permission-denied" || nativeOutcome.kind === "parse-failed");

      if (shouldSetExternalClipboardError && nativeOutcome) {
        setFileOperationError(
          nativeOutcome.kind === "permission-denied" ? t("files.operations.failed") : nativeOutcome.message,
        );
      }

      const resolvedClipboardSource = resolveClipboardSource(
        {
          clipboardState,
          externalSourcePaths,
          externalFilePayloads,
        },
        DEFAULT_CLIPBOARD_SOURCE_RESOLVERS,
      );

      if (!resolvedClipboardSource) {
        return;
      }

      if (resolvedClipboardSource.kind === "external-paths") {
        if (!beginExternalImportLock()) {
          return;
        }

        const operationId = beginFileOperation("import");

        try {
          await importEntries({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            sourcePaths: resolvedClipboardSource.sourcePaths,
            destinationRelativePath: destinationPath,
          });
          completeFileOperation(operationId);

          await reloadVisibleTree();
          const nextRepoFiles = await loadAllRepoFiles();
          requestFileTreeSelection(
            resolvePreferredImportedPath(
              repoFilesBeforePaste,
              nextRepoFiles,
              destinationPath,
              resolvedClipboardSource.sourcePaths,
            ),
          );
        } catch (error) {
          failFileOperation(operationId, error);
          console.error("Failed to import pasted external workspace entries", error);
        } finally {
          endExternalImportLock();
        }
        return;
      }

      if (resolvedClipboardSource.kind === "external-file-payloads") {
        if (!beginExternalImportLock()) {
          return;
        }

        const operationId = beginFileOperation("import");

        try {
          await importFilePayloads({
            workspaceWorktreePath: selectedWorkspaceWorktreePath,
            filePayloads: resolvedClipboardSource.filePayloads,
            destinationRelativePath: destinationPath,
          });
          completeFileOperation(operationId);

          await reloadVisibleTree();
          const nextRepoFiles = await loadAllRepoFiles();
          requestFileTreeSelection(
            resolvePreferredImportedPath(
              repoFilesBeforePaste,
              nextRepoFiles,
              destinationPath,
              resolvedClipboardSource.filePayloads.map((filePayload) => filePayload.relativePath),
            ),
          );
        } catch (error) {
          failFileOperation(operationId, error);
          console.error("Failed to import pasted external workspace file payloads", error);
        } finally {
          endExternalImportLock();
        }
        return;
      }

      const moveUndoEntries =
        resolvedClipboardSource.mode === "move"
          ? buildMoveUndoEntries(repoFilesBeforePaste, resolvedClipboardSource.sourcePaths, destinationPath)
          : [];
      const operationId = beginFileOperation(resolvedClipboardSource.mode);

      try {
        await pasteEntries({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          sourceRelativePaths: resolvedClipboardSource.sourcePaths,
          destinationRelativePath: destinationPath,
          mode: resolvedClipboardSource.mode,
        });
        completeFileOperation(operationId);

        await reloadVisibleTree();
        const nextRepoFiles = await loadAllRepoFiles();
        requestFileTreeSelection(
          resolvePreferredImportedPath(
            repoFilesBeforePaste,
            nextRepoFiles,
            destinationPath,
            resolvedClipboardSource.sourcePaths,
          ),
        );

        if (resolvedClipboardSource.mode === "move") {
          if (moveUndoEntries.length > 0) {
            pushUndoAction({
              kind: "move",
              entries: moveUndoEntries,
            });
          }
          setClipboardState(null);
        }
      } catch (error) {
        failFileOperation(operationId, error);
        console.error("Failed to paste workspace entries", error);
      }
    },
    [
      allRepoEntries,
      beginExternalImportLock,
      beginFileOperation,
      clipboardState,
      completeFileOperation,
      endExternalImportLock,
      failFileOperation,
      loadAllRepoFiles,
      reloadVisibleTree,
      pushUndoAction,
      requestFileTreeSelection,
      resolveExternalClipboardSourcePaths,
      selectedWorkspaceWorktreePath,
      t,
    ],
  );

  const onDropExternalEntries = useCallback(
    async (sourcePaths: string[], destinationPath: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }

      const repoFilesBeforeDropImport = allRepoEntries
        ? mapWorkspaceEntryPaths(allRepoEntries)
        : await loadAllRepoFiles();
      if (!beginExternalImportLock()) {
        return;
      }

      const operationId = beginFileOperation("import");

      try {
        await importEntries({
          workspaceWorktreePath: selectedWorkspaceWorktreePath,
          sourcePaths,
          destinationRelativePath: destinationPath,
        });
        completeFileOperation(operationId);

        await reloadVisibleTree();
        const nextRepoFiles = await loadAllRepoFiles();
        requestFileTreeSelection(
          resolvePreferredImportedPath(repoFilesBeforeDropImport, nextRepoFiles, destinationPath, sourcePaths),
        );
      } catch (error) {
        failFileOperation(operationId, error);
        console.error("Failed to import dropped workspace entries", error);
      } finally {
        endExternalImportLock();
      }
    },
    [
      allRepoEntries,
      beginExternalImportLock,
      beginFileOperation,
      completeFileOperation,
      endExternalImportLock,
      failFileOperation,
      loadAllRepoFiles,
      reloadVisibleTree,
      requestFileTreeSelection,
      selectedWorkspaceWorktreePath,
    ],
  );

  return {
    repoFiles,
    ignoredRepoPaths,
    loadedDirectoryPaths,
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
    ensureDirectoryLoaded,
    loadExpandedDirectory,
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
    onRefresh: async () => {
      await reloadVisibleTree({
        reloadLoadedDirectories: true,
        reloadContextDirectories: true,
      });
    },
    onUndoLastEntryOperation: async () => {
      await handleUndoLastFileTreeOperation();
    },
  };
}
