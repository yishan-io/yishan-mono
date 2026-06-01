import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWorkspaceStoreActions } from "./workspace/actions";
import { initialWorkspaceState, partializeWorkspaceState } from "./workspace/state";
import type { WorkspaceStoreState } from "./types";

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
      pullRequestByWorkspaceId: {},
      latestPullRequestByWorkspaceId: {},
      gitChangesCountByWorkspaceId: {},
      gitChangeTotalsByWorkspaceId: {},
      gitRefreshVersionByWorktreePath: {},
      fileTreeChangedRelativePathsByWorktreePath: {},
      selectedProjectId: initialWorkspaceState.selectedProjectId,
      selectedWorkspaceId: initialWorkspaceState.selectedWorkspaceId,
      displayProjectIds: [],
      lastUsedExternalAppId: undefined,
      organizationPreferencesById: {},
      fileTreeRefreshVersion: 0,
      workspaceListHierarchyMode: "by_project",
      ...createWorkspaceStoreActions(set, get),
    })),
    {
      name: "yishan-workspace-store",
      storage: createJSONStorage(() => localStorage),
      partialize: partializeWorkspaceState,
    },
  ),
);
