import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWorkspaceStoreActions } from "./workspace/actions";
import { initialWorkspaceState, partializeWorkspaceState } from "./workspace/state";
import type { WorkspaceStoreState } from "./workspaceStoreTypes";

export type { WorkspaceStoreState } from "./workspaceStoreTypes";

export const workspaceStore = create<WorkspaceStoreState>()(
  persist(
    immer((set, get) => ({
      workspaces: initialWorkspaceState.workspaces,
      orderedWorkspaceIds: [],
      applyPrimaryWorkspacePath: ({ workspaceId, worktreePath }) => {
        set((state) => {
          const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
          if (!workspace || workspace.kind !== "local") return;
          workspace.worktreePath = worktreePath;
          workspace.state = "active";
          workspace.health = undefined;
        });
      },
      ...createWorkspaceStoreActions(set, get),
    })),
    {
      name: "yishan-workspace-store",
      storage: createJSONStorage(() => localStorage),
      partialize: partializeWorkspaceState,
    },
  ),
);
