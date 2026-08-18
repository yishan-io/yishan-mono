/**
 * Files feature file-tree interaction Store (desktop6-adjust.md W3).
 *
 * Owns file-tree interaction signals that previously lived in the Workspace
 * UI Store: selection, refresh/change signals, expanded paths, and the
 * delete/undo/search/folder-select request counters. The Files feature owns
 * file browsing and editing; Workspace no longer owns generic screen state.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

function isGitInternalPath(path: string): boolean {
  return path === ".git" || path.startsWith(".git/");
}

export type FileTreeStoreState = {
  // ── file tree signals ──────────────────────────────────────────────────────
  selectedEntryPath: string;
  /** Monotonic refresh version bumped on every file-tree invalidation event. */
  fileTreeRefreshVersion: number;
  /** Latest changed relative paths per worktree path (from workspace.files.changed). */
  fileTreeChangedRelativePathsByWorktreePath: Record<string, string[]>;
  expandedFileTreeItemsByWorkspaceId: Record<string, string[]>;
  deleteSelectionRequestId: number;
  undoRequestId: number;
  fileSearchRequestKey: number;
  /** Path and monotonic request id for selecting a folder in the file tree from another view. */
  selectFolderInFileTreePath: string;
  selectFolderInFileTreeRequestId: number;

  setSelectedEntryPath: (path: string) => void;
  /** Bumps the file-tree refresh version and records changed relative paths for one worktree. */
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
  setExpandedFileTreeItems: (workspaceId: string, paths: string[]) => void;
  requestDeleteSelection: () => void;
  requestUndo: () => void;
  requestFileSearch: () => void;
  /** Dispatches a folder selection signal consumed by FileManagerView. */
  requestSelectFolderInFileTree: (path: string) => void;
};

/** Stores file-tree interaction signals for the Files feature. */
export const fileTreeStore = create<FileTreeStoreState>()(
  immer((set) => ({
    selectedEntryPath: "",
    fileTreeRefreshVersion: 0,
    fileTreeChangedRelativePathsByWorktreePath: {},
    expandedFileTreeItemsByWorkspaceId: {},
    deleteSelectionRequestId: 0,
    undoRequestId: 0,
    fileSearchRequestKey: 0,
    selectFolderInFileTreePath: "",
    selectFolderInFileTreeRequestId: 0,

    incrementFileTreeRefreshVersion: (workspaceWorktreePath, changedRelativePaths) => {
      const normalizedWorkspaceWorktreePath = workspaceWorktreePath?.trim() ?? "";
      if (normalizedWorkspaceWorktreePath.length === 0) {
        return;
      }

      const normalizedChangedRelativePaths = (changedRelativePaths ?? [])
        .map((path) => path.trim())
        .filter((path) => path.length > 0 && !isGitInternalPath(path));

      set((state) => {
        state.fileTreeRefreshVersion += 1;
        state.fileTreeChangedRelativePathsByWorktreePath[normalizedWorkspaceWorktreePath] =
          normalizedChangedRelativePaths;
      });
    },
    setSelectedEntryPath: (selectedEntryPath) => {
      set({ selectedEntryPath });
    },
    setExpandedFileTreeItems: (workspaceId, paths) => {
      set((state) => {
        state.expandedFileTreeItemsByWorkspaceId[workspaceId] = paths;
      });
    },
    requestDeleteSelection: () => {
      set((state) => {
        state.deleteSelectionRequestId += 1;
      });
    },
    requestUndo: () => {
      set((state) => {
        state.undoRequestId += 1;
      });
    },
    requestFileSearch: () => {
      set((state) => {
        state.fileSearchRequestKey += 1;
      });
    },
    requestSelectFolderInFileTree: (path) => {
      set((state) => {
        state.selectFolderInFileTreePath = path;
        state.selectFolderInFileTreeRequestId += 1;
      });
    },
  })),
);
