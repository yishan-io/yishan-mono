import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const LAYOUT_STORE_STORAGE_KEY = "yishan-layout-store";
export const DEFAULT_LEFT_WIDTH = 320;
export const DEFAULT_RIGHT_WIDTH = 400;

/** Selected right-pane tab per workspace. Owned by Workbench layout (W3). */
export type WorkspaceRightPaneTab = "files" | "changes" | "pr";

/** Default right-pane tab when no per-workspace preference has been set. */
export const DEFAULT_RIGHT_PANE_TAB: WorkspaceRightPaneTab = "files";

export type LayoutStoreState = {
  // ── persisted layout ───────────────────────────────────────────────────────
  leftWidth: number;
  rightWidth: number;
  isLeftPaneManuallyHidden: boolean;
  // ── transient popup tracking (moved to app/state/popupStore in W6b) ───────
  // ── right-pane state (per-workspace, desktop6-adjust.md W3) ────────────────
  /** Selected right-pane tab per workspace. Falls back to `DEFAULT_RIGHT_PANE_TAB`. */
  rightPaneTabByWorkspaceId: Record<string, WorkspaceRightPaneTab>;
  /** Whether the right pane is manually hidden per workspace. Falls back to `true` (hidden). */
  isRightPaneHiddenByWorkspaceId: Record<string, boolean>;

  setLeftPaneWidth: (width: number) => void;
  setRightPaneWidth: (width: number) => void;
  setIsLeftPaneManuallyHidden: (hidden: boolean) => void;
  setRightPaneTab: (workspaceId: string, tab: WorkspaceRightPaneTab) => void;
  setIsRightPaneHidden: (workspaceId: string, hidden: boolean) => void;
  /** Removes per-workspace right-pane state when a workspace closes. */
  removeRightPaneStateForWorkspace: (workspaceId: string) => void;
};

/** Stores persisted desktop layout preferences and per-workspace pane state. */
export const layoutStore = create<LayoutStoreState>()(
  persist(
    immer((set) => ({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      isLeftPaneManuallyHidden: false,
      rightPaneTabByWorkspaceId: {},
      isRightPaneHiddenByWorkspaceId: {},

      setLeftPaneWidth: (leftWidth) => {
        set({ leftWidth });
      },
      setRightPaneWidth: (rightWidth) => {
        set({ rightWidth });
      },
      setIsLeftPaneManuallyHidden: (isLeftPaneManuallyHidden) => {
        set({ isLeftPaneManuallyHidden });
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
      removeRightPaneStateForWorkspace: (workspaceId) => {
        set((state) => {
          delete state.rightPaneTabByWorkspaceId[workspaceId];
          delete state.isRightPaneHiddenByWorkspaceId[workspaceId];
        });
      },
    })),
    {
      name: LAYOUT_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        isLeftPaneManuallyHidden: state.isLeftPaneManuallyHidden,
      }),
    },
  ),
);
