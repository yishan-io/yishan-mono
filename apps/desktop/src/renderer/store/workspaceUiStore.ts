import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type WorkspaceRightPaneTab = "files" | "changes" | "pr";
export type WorkspaceListHierarchyMode = "by_project" | "by_node";

/** Default right-pane tab when no per-workspace preference has been set. */
export const DEFAULT_RIGHT_PANE_TAB: WorkspaceRightPaneTab = "files";

/** Which overlay panel (if any) is shown in place of the main pane. */
export type OverlayPanel = "overview" | "scheduledJob";

type WorkspaceUiStoreState = {
  // ── file tree signals ──────────────────────────────────────────────────────
  selectedEntryPath: string;
  expandedFileTreeItemsByWorkspaceId: Record<string, string[]>;
  deleteSelectionRequestId: number;
  undoRequestId: number;
  // ── pane state (per-workspace) ─────────────────────────────────────────────
  /** Selected right-pane tab per workspace. Falls back to `DEFAULT_RIGHT_PANE_TAB`. */
  rightPaneTabByWorkspaceId: Record<string, WorkspaceRightPaneTab>;
  /** Whether the right pane is manually hidden per workspace. Falls back to `true` (hidden). */
  isRightPaneHiddenByWorkspaceId: Record<string, boolean>;
  fileSearchRequestKey: number;
  /** Which overlay panel is currently visible in the main pane, or `null` for none. */
  overlayPanel: OverlayPanel | null;

  setSelectedEntryPath: (path: string) => void;
  setExpandedFileTreeItems: (workspaceId: string, paths: string[]) => void;
  requestDeleteSelection: () => void;
  requestUndo: () => void;
  setRightPaneTab: (workspaceId: string, tab: WorkspaceRightPaneTab) => void;
  setIsRightPaneHidden: (workspaceId: string, hidden: boolean) => void;
  requestFileSearch: () => void;
  /** Opens the given overlay panel (closing any other). */
  setOverlayPanel: (panel: OverlayPanel | null) => void;
  /** Closes any open overlay panel. */
  closeOverlayPanel: () => void;
};

/** Stores workspace-scoped UI signals: file-tree selection/commands and right-pane tab state. */
export const workspaceUiStore = create<WorkspaceUiStoreState>()(
  immer((set) => ({
    selectedEntryPath: "",
    expandedFileTreeItemsByWorkspaceId: {},
    deleteSelectionRequestId: 0,
    undoRequestId: 0,
    rightPaneTabByWorkspaceId: {},
    isRightPaneHiddenByWorkspaceId: {},
    fileSearchRequestKey: 0,
    overlayPanel: null,

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
    setOverlayPanel: (panel) => {
      set({ overlayPanel: panel });
    },
    closeOverlayPanel: () => {
      set({ overlayPanel: null });
    },
  })),
);
