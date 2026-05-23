import { sessionStore } from "../sessionStore";
import type {
  WorkspaceStoreActions,
  WorkspaceStoreGetState,
  WorkspaceStoreSetState,
  WorkspaceStoreState,
} from "../types";

type WorkspaceSelectionActions = Pick<
  WorkspaceStoreActions,
  "setSelectedProjectId" | "setSelectedWorkspaceId" | "setDisplayProjectIds" | "setLastUsedExternalAppId"
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
  const applyOrganizationPreferences = (
    state: WorkspaceStoreState,
    organizationId: string,
    updater: (organizationPreferences: NonNullable<WorkspaceStoreState["organizationPreferencesById"]>[string]) => void,
  ): void => {
    if (!organizationId) {
      return;
    }

    state.organizationPreferencesById ??= {};
    state.organizationPreferencesById[organizationId] ??= {};
    updater(state.organizationPreferencesById[organizationId]);
  };

  return {
    setSelectedProjectId: (projectId) => {
      const { selectedWorkspaceId, workspaces } = get();
      const workspaceBelongsToProject = workspaces.some(
        (workspace) => workspace.id === selectedWorkspaceId && resolveWorkspaceProjectId(workspace) === projectId,
      );
      const nextWorkspaceId = workspaceBelongsToProject
        ? selectedWorkspaceId
        : (workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === projectId)?.id ?? "");
      // Read session state before entering the set() callback.
      const organizationId = sessionStore.getState().selectedOrganizationId?.trim() ?? "";

      set((state) => {
        state.selectedProjectId = projectId;
        state.selectedWorkspaceId = nextWorkspaceId;
        applyOrganizationPreferences(state, organizationId, (organizationPreferences) => {
          organizationPreferences.selectedProjectId = projectId;
          organizationPreferences.selectedWorkspaceId = nextWorkspaceId;
        });
      });
    },
    setSelectedWorkspaceId: (workspaceId) => {
      const organizationId = sessionStore.getState().selectedOrganizationId?.trim() ?? "";

      set((state) => {
        state.selectedWorkspaceId = workspaceId;
        const selectedWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId);
        if (selectedWorkspace) {
          state.selectedProjectId = resolveWorkspaceProjectId(selectedWorkspace);
        }
        applyOrganizationPreferences(state, organizationId, (organizationPreferences) => {
          if (selectedWorkspace) {
            organizationPreferences.selectedProjectId = resolveWorkspaceProjectId(selectedWorkspace);
          }
          organizationPreferences.selectedWorkspaceId = workspaceId;
        });
      });
    },
    setDisplayProjectIds: (projectIds) => {
      const organizationId = sessionStore.getState().selectedOrganizationId?.trim() ?? "";

      set((state) => {
        state.displayProjectIds = projectIds;
        applyOrganizationPreferences(state, organizationId, (organizationPreferences) => {
          organizationPreferences.displayProjectIds = projectIds;
        });
      });
    },
    setLastUsedExternalAppId: (appId) => {
      const organizationId = sessionStore.getState().selectedOrganizationId?.trim() ?? "";

      set((state) => {
        state.lastUsedExternalAppId = appId;
        applyOrganizationPreferences(state, organizationId, (organizationPreferences) => {
          organizationPreferences.lastUsedExternalAppId = appId;
        });
      });
    },
  };
}
