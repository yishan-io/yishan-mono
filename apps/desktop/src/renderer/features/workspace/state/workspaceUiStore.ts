import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

function isGitInternalPath(path: string): boolean {
  return path === ".git" || path.startsWith(".git/");
}

export type WorkspaceRightPaneTab = "files" | "changes" | "pr";
export type WorkspaceListHierarchyMode = "by_project" | "by_node";

/** Default right-pane tab when no per-workspace preference has been set. */
export const DEFAULT_RIGHT_PANE_TAB: WorkspaceRightPaneTab = "files";

/** Which overlay panel (if any) is shown in place of the main pane. */
export type OverlayPanel = "overview" | "scheduledJob";

type WorkspaceUiStoreState = {
  // ── file tree signals ──────────────────────────────────────────────────────
  selectedEntryPath: string;
  /** Monotonic refresh version bumped on every file-tree invalidation event. */
  fileTreeRefreshVersion: number;
  /** Latest changed relative paths per worktree path (from workspace.files.changed). */
  fileTreeChangedRelativePathsByWorktreePath: Record<string, string[]>;
  expandedFileTreeItemsByWorkspaceId: Record<string, string[]>;
  deleteSelectionRequestId: number;
  undoRequestId: number;
  // ── pane state (per-workspace) ─────────────────────────────────────────────
  /** Selected right-pane tab per workspace. Falls back to `DEFAULT_RIGHT_PANE_TAB`. */
  rightPaneTabByWorkspaceId: Record<string, WorkspaceRightPaneTab>;
  /** Whether the right pane is manually hidden per workspace. Falls back to `true` (hidden). */
  isRightPaneHiddenByWorkspaceId: Record<string, boolean>;
  fileSearchRequestKey: number;
  /** Path and monotonic request id for selecting a folder in the file tree from another view. */
  selectFolderInFileTreePath: string;
  selectFolderInFileTreeRequestId: number;
  /** Which overlay panel is currently visible in the main pane, or `null` for none. */
  overlayPanel: OverlayPanel | null;

  setSelectedEntryPath: (path: string) => void;
  /** Bumps the file-tree refresh version and records changed relative paths for one worktree. */
  incrementFileTreeRefreshVersion: (workspaceWorktreePath?: string, changedRelativePaths?: string[]) => void;
  setExpandedFileTreeItems: (workspaceId: string, paths: string[]) => void;
  requestDeleteSelection: () => void;
  requestUndo: () => void;
  setRightPaneTab: (workspaceId: string, tab: WorkspaceRightPaneTab) => void;
  setIsRightPaneHidden: (workspaceId: string, hidden: boolean) => void;
  requestFileSearch: () => void;
  /** Dispatches a folder selection signal consumed by FileManagerView. */
  requestSelectFolderInFileTree: (path: string) => void;
  /** Opens the given overlay panel (closing any other). */
  setOverlayPanel: (panel: OverlayPanel | null) => void;
  /** Closes any open overlay panel. */
  closeOverlayPanel: () => void;
};

/** Stores workspace-scoped UI signals: file-tree selection/commands and right-pane tab state. */
export const workspaceUiStore = create<WorkspaceUiStoreState>()(
  immer((set) => ({
    selectedEntryPath: "",
    fileTreeRefreshVersion: 0,
    fileTreeChangedRelativePathsByWorktreePath: {},
    expandedFileTreeItemsByWorkspaceId: {},
    deleteSelectionRequestId: 0,
    undoRequestId: 0,
    rightPaneTabByWorkspaceId: {},
    isRightPaneHiddenByWorkspaceId: {},
    fileSearchRequestKey: 0,
    selectFolderInFileTreePath: "",
    selectFolderInFileTreeRequestId: 0,
    overlayPanel: null,

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
    setRightPaneTab: (workspaceId, tab) => {
      set((state) => {
        state.rightPaneTabByWorkspaceId[workspaceId] = tab;
      });
    },
    setIsRightPaneHidden: (workspaceId, hidden) => {
      set((state) => {
        state.isRightPaneHiddenByWorkspaceId[workspaceId] = hidden;
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
    setOverlayPanel: (panel) => {
      set({ overlayPanel: panel });
    },
    closeOverlayPanel: () => {
      set({ overlayPanel: null });
    },
  })),
);
