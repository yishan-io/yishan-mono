/**
 * Workbench navigation Store (desktop6-adjust.md W2).
 *
 * Owns the active Workspace and Project context plus the screen overlay panel.
 * Previously these lived in the Workspace feature Store/UI Store; Workbench
 * owns Desktop context and presentation state.
 */
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

/** Which overlay panel (if any) is shown in place of the main pane. */
export type OverlayPanel = "overview" | "tasks" | "scheduledJob";

export type WorkbenchNavigationState = {
  activeProjectId: string;
  activeWorkspaceId: string;
  overlayPanel: OverlayPanel | null;
  setActiveProjectId: (projectId: string) => void;
  setActiveWorkspaceId: (workspaceId: string) => void;
  setOverlayPanel: (panel: OverlayPanel | null) => void;
  closeOverlayPanel: () => void;
};

/** Stores the active Workspace/Project context and the overlay panel. */
export const workbenchNavigationStore = create<WorkbenchNavigationState>()(
  immer((set) => ({
    activeProjectId: "",
    activeWorkspaceId: "",
    overlayPanel: null,
    setActiveProjectId: (projectId) => {
      set({ activeProjectId: projectId });
    },
    setActiveWorkspaceId: (workspaceId) => {
      set({ activeWorkspaceId: workspaceId });
    },
    setOverlayPanel: (panel) => {
      set({ overlayPanel: panel });
    },
    closeOverlayPanel: () => {
      set({ overlayPanel: null });
    },
  })),
);
