import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type WorkspaceRightPaneTab = "files" | "changes" | "pr";
export type WorkspaceListHierarchyMode = "by_project" | "by_node";

type WorkspaceUiStoreState = {
  // ── file tree signals ──────────────────────────────────────────────────────
  selectedEntryPath: string;
  deleteSelectionRequestId: number;
  undoRequestId: number;
  // ── pane state ─────────────────────────────────────────────────────────────
  rightPaneTab: WorkspaceRightPaneTab;
  fileSearchRequestKey: number;
  /** Whether the scheduled job panel is visible in the main pane. */
  isScheduledJobPanelOpen: boolean;

  setSelectedEntryPath: (path: string) => void;
  requestDeleteSelection: () => void;
  requestUndo: () => void;
  setRightPaneTab: (tab: WorkspaceRightPaneTab) => void;
  requestFileSearch: () => void;
  setScheduledJobPanelOpen: (isOpen: boolean) => void;
};

/** Stores workspace-scoped UI signals: file-tree selection/commands and right-pane tab state. */
export const workspaceUiStore = create<WorkspaceUiStoreState>()(
  immer((set) => ({
    selectedEntryPath: "",
    deleteSelectionRequestId: 0,
    undoRequestId: 0,
    rightPaneTab: "files",
    fileSearchRequestKey: 0,
    isScheduledJobPanelOpen: false,

      setSelectedEntryPath: (selectedEntryPath) => {
        set({ selectedEntryPath });
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
      setRightPaneTab: (rightPaneTab) => {
        set({ rightPaneTab });
      },
      requestFileSearch: () => {
        set((state) => {
          state.fileSearchRequestKey += 1;
        });
      },
    setScheduledJobPanelOpen: (isOpen) => {
      set({ isScheduledJobPanelOpen: isOpen });
    },
  })),
);
