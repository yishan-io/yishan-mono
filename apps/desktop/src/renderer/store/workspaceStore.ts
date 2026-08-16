import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { WorkspaceStoreState } from "./types";
import { createWorkspaceStoreActions } from "./workspace/actions";
import { initialWorkspaceState, partializeWorkspaceState } from "./workspace/state";

export type {
  AvailableCommand,
  AvailableModel,
  ChatMessage,
  OpenWorkspaceTabInput,
  WorkspaceStoreState,
  WorkspaceTab,
} from "./types";

export const workspaceStore = create<WorkspaceStoreState>()(
  persist(
    immer((set, get) => ({
      projects: initialWorkspaceState.projects,
      workspaces: initialWorkspaceState.workspaces,
      selectedProjectId: initialWorkspaceState.selectedProjectId,
      selectedWorkspaceId: initialWorkspaceState.selectedWorkspaceId,
      isProjectsLoaded: false,
      orderedWorkspaceIds: [],
      ...createWorkspaceStoreActions(set, get),
    })),
    {
      name: "yishan-workspace-store",
      storage: createJSONStorage(() => localStorage),
      partialize: partializeWorkspaceState,
    },
  ),
);
