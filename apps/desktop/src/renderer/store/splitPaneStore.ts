import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  type PaneLeaf,
  type SplitDirection,
  type SplitPaneNode,
  type SplitPaneStateSlice,
  addTabToPane,
  collectLeaves,
  createLeaf,
  createPaneId,
  findLeaf,
  findLeafByTabId,
  moveTabToPane,
  removeTabFromPane,
  reorderTabInPane,
  selectTabInPane,
  setActivePaneState,
  setSplitRatio,
  splitPaneWithTab,
} from "./split-pane";

const ROOT_PANE_ID = "root-pane";

function createEmptyLayout(): SplitPaneStateSlice {
  return { root: createLeaf(ROOT_PANE_ID, [], ""), activePaneId: ROOT_PANE_ID };
}

export type SplitPaneStoreState = {
  /** Layouts keyed by workspace id. Each workspace keeps its own layout tree. */
  layoutByWorkspaceId: Record<string, SplitPaneStateSlice>;

  // Queries (workspace-scoped)
  getLayout: (workspaceId: string) => SplitPaneStateSlice;
  getActivePane: (workspaceId: string) => PaneLeaf | null;
  getPane: (workspaceId: string, paneId: string) => PaneLeaf | null;
  getPaneForTab: (workspaceId: string, tabId: string) => PaneLeaf | null;
  getAllPanes: (workspaceId: string) => PaneLeaf[];
  retainWorkspaceLayouts: (workspaceIds: string[]) => void;

  // Mutations (workspace-scoped)
  setActivePane: (workspaceId: string, paneId: string) => void;
  selectTab: (workspaceId: string, paneId: string, tabId: string) => void;
  registerTabInPane: (workspaceId: string, tabId: string, paneId?: string) => void;
  unregisterTabFromPane: (workspaceId: string, tabId: string) => void;
  splitPane: (
    workspaceId: string,
    input: {
      tabId: string;
      targetPaneId: string;
      direction: SplitDirection;
      placement: "first" | "second";
    },
  ) => void;
  moveTab: (workspaceId: string, tabId: string, targetPaneId: string) => void;
  reorderTab: (
    workspaceId: string,
    paneId: string,
    draggedTabId: string,
    targetTabId: string,
    position: "before" | "after",
  ) => void;
  updateSplitRatio: (workspaceId: string, branchId: string, ratio: number) => void;
};

/** Returns the layout for a workspace, creating one if it doesn't exist yet. */
function ensureLayout(layouts: Record<string, SplitPaneStateSlice>, workspaceId: string): SplitPaneStateSlice {
  if (!layouts[workspaceId]) {
    layouts[workspaceId] = createEmptyLayout();
  }
  return layouts[workspaceId];
}

/** Stores per-workspace split-pane layout trees for the editor area. */
export const splitPaneStore = create<SplitPaneStoreState>()(
  immer((set, get) => ({
    layoutByWorkspaceId: {},

    getLayout: (workspaceId) => {
      return get().layoutByWorkspaceId[workspaceId] ?? createEmptyLayout();
    },

    getActivePane: (workspaceId) => {
      const layout = get().layoutByWorkspaceId[workspaceId];
      if (!layout) return null;
      return findLeaf(layout.root, layout.activePaneId);
    },

    getPane: (workspaceId, paneId) => {
      const layout = get().layoutByWorkspaceId[workspaceId];
      if (!layout) return null;
      return findLeaf(layout.root, paneId);
    },

    getPaneForTab: (workspaceId, tabId) => {
      const layout = get().layoutByWorkspaceId[workspaceId];
      if (!layout) return null;
      return findLeafByTabId(layout.root, tabId);
    },

    getAllPanes: (workspaceId) => {
      const layout = get().layoutByWorkspaceId[workspaceId];
      if (!layout) return [];
      return collectLeaves(layout.root);
    },

    retainWorkspaceLayouts: (workspaceIds) => {
      const workspaceIdSet = new Set(workspaceIds);
      set((state) => {
        for (const workspaceId of Object.keys(state.layoutByWorkspaceId)) {
          if (!workspaceIdSet.has(workspaceId)) {
            delete state.layoutByWorkspaceId[workspaceId];
          }
        }
      });
    },

    setActivePane: (workspaceId, paneId) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = setActivePaneState(layout, paneId);
        if (next) {
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    selectTab: (workspaceId, paneId, tabId) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = selectTabInPane(layout, paneId, tabId);
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    registerTabInPane: (workspaceId, tabId, paneId) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = addTabToPane(layout, tabId, paneId);
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    unregisterTabFromPane: (workspaceId, tabId) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = removeTabFromPane(layout, tabId);
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    splitPane: (workspaceId, input) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = splitPaneWithTab(layout, {
          ...input,
          newPaneId: createPaneId(),
          newBranchId: createPaneId(),
        });
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    moveTab: (workspaceId, tabId, targetPaneId) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = moveTabToPane(layout, { tabId, targetPaneId });
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    reorderTab: (workspaceId, paneId, draggedTabId, targetTabId, position) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = reorderTabInPane(layout, paneId, draggedTabId, targetTabId, position);
        if (next) {
          layout.root = next.root;
          layout.activePaneId = next.activePaneId;
        }
      });
    },

    updateSplitRatio: (workspaceId, branchId, ratio) => {
      set((state) => {
        const layout = ensureLayout(state.layoutByWorkspaceId, workspaceId);
        const next = setSplitRatio(layout, branchId, ratio);
        if (next) {
          layout.root = next.root;
        }
      });
    },
  })),
);
