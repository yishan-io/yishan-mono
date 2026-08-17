import { sessionStore } from "../../../../features/session/state/sessionStore";
import type {
  WorkspaceStoreActions,
  WorkspaceStoreGetState,
  WorkspaceStoreSetState,
  WorkspaceStoreState,
} from "../../../../store/types";

type WorkspaceSelectionActions = Pick<
  WorkspaceStoreActions,
  "setSelectedProjectId" | "setSelectedWorkspaceId" | "setOrderedWorkspaceIds"
>;

export function createWorkspaceSelectionActions(
  set: WorkspaceStoreSetState,
  get: WorkspaceStoreGetState,
): WorkspaceSelectionActions {
  const resolveWorkspaceProjectId = (workspace: { projectId?: string; repoId: string }): string => {
    return workspace.projectId ?? workspace.repoId;
  };

  /**
   * Persists selection preferences for the given organization.
   * `organizationId` must be resolved _before_ calling `set()` to avoid
   * reading a sibling store inside a mutation callback.
   */
  return {
    setSelectedProjectId: (projectId) => {
      const { selectedWorkspaceId, workspaces } = get();
      const workspaceBelongsToProject = workspaces.some(
        (workspace) => workspace.id === selectedWorkspaceId && resolveWorkspaceProjectId(workspace) === projectId,
      );
      const nextWorkspaceId = workspaceBelongsToProject
        ? selectedWorkspaceId
        : (workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === projectId)?.id ?? "");

      set((state) => {
        state.selectedProjectId = projectId;
        state.selectedWorkspaceId = nextWorkspaceId;
      });
    },
    setSelectedWorkspaceId: (workspaceId) => {
      set((state) => {
        state.selectedWorkspaceId = workspaceId;
        const selectedWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId);
        if (selectedWorkspace) {
          state.selectedProjectId = resolveWorkspaceProjectId(selectedWorkspace);
        }
        // Clear any stale file-change paths accumulated for the incoming workspace
        // while the user was viewing a different workspace. Keeping them would cause
      });
    },
    setOrderedWorkspaceIds: (ids) => {
      set({ orderedWorkspaceIds: ids });
    },
  };
}
