import { closeTab, openTab, renameTabsForEntryRename, tabStore } from "@renderer/domains/workbench";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeClipboardState } from "../clipboard/clipboardSourceResolvers";
import { useFileTreeClipboard } from "../clipboard/useFileTreeClipboard";
import { getFileOperationErrorMessage } from "../fileTreeEntries";
import { useFileOperationState } from "../useFileOperationState";
import { useFileTreeCrud } from "./useFileTreeCrud";
import { type FileTreeUndoAction, useFileTreeUndo } from "./useFileTreeUndo";

import { normalizeRelativePath } from "../fileTreePaths";
import type { ExternalAppId } from "../../../externalApps";
import type { FileOperationState } from "../useFileOperationState";
import { useFileTreeListing } from "./useFileTreeListing";

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

/** Composes lifecycle-owned listing and existing file-entry operations. */
export function useFileTreeOperations(): UseFileTreeOperationsResult {
  const listing = useFileTreeListing();
  const actions = useFileTreeEntryOperations(listing);
  return { ...actions, repoFiles: listing.repoFiles, ignoredRepoPaths: listing.ignoredRepoPaths,
    ensurePathLoaded: listing.ensurePathLoaded, loadAllRepoFiles: listing.loadAllRepoFiles,
    onRefresh: listing.refreshAllRepoFiles,
  };
}

/** Composes entry actions independently of asynchronous listing ownership. */
function useFileTreeEntryOperations({ selectedWorkspaceId, selectedWorkspaceWorktreePath,
  repoEntries, repoFiles, loadAllRepoFiles, isCurrentListing }: ReturnType<typeof useFileTreeListing>) {
  const [clipboardState, setClipboardState] = useState<FileTreeClipboardState | null>(null);
  const [undoStack, setUndoStack] = useState<FileTreeUndoAction[]>([]);
  const [fileTreeSelectionRequest, setFileTreeSelectionRequest] = useState<FileTreeSelectionRequest | null>(null);
  const fileTreeSelectionRequestIdRef = useRef(0);
  const tabs = tabStore((state) => state.tabs);
  const { fileOperationState, fileOperationError, setFileOperationError, resetFileOperationState,
    beginFileOperation, completeFileOperation, failFileOperation } = useFileOperationState(selectedWorkspaceWorktreePath, isCurrentListing);
  useEffect(() => {
    resetFileOperationState(); setFileOperationError(null); setClipboardState(null);
    setUndoStack([]); setFileTreeSelectionRequest(null);
  }, [resetFileOperationState, selectedWorkspaceId, selectedWorkspaceWorktreePath, setFileOperationError, isCurrentListing]);
  const requestFileTreeSelection = useCallback((path: string | null, focus = true) => {
    if (!isCurrentListing()) return;
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
  }, [isCurrentListing]);

  const { pushUndoAction, handleUndoLastFileTreeOperation } = useFileTreeUndo({
    isCurrentListing,
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
    isCurrentListing,
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

  return {
    fileOperationState, fileOperationError, fileTreeSelectionRequest,
    canPasteEntries: Boolean(selectedWorkspaceWorktreePath), canUndoLastEntryOperation: undoStack.length > 0,
    revealFileInTree: (path: string | null) => requestFileTreeSelection(path, false),
    openWorkspaceFile, onCreateFile, onCreateFolder, onRenameEntry, onCopyPath, onCopyRelativePath,
    onOpenInFileManager, onOpenInExternalApp, onDeleteEntry: handleDeleteEntry,
    onCopyEntry: async (path: string) => { setInternalClipboardState("copy", path); },
    onCutEntry: async (path: string) => { setInternalClipboardState("move", path); },
    onPasteEntries, onDropExternalEntries, onMoveEntries,
    onUndoLastEntryOperation: handleUndoLastFileTreeOperation,
  };
}
