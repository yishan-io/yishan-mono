import {
  buildCreatedRepoState,
  buildDeletedRepoState,
  buildHydratedStateFromApiData,
  buildUpdatedRepoConfigState,
  normalizeCreateRepoInput,
} from "../helpers/projectHelpers";
import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "./types";

type WorkspaceRepoActions = Pick<
  WorkspaceStoreActions,
  | "load"
  | "createProject"
  | "deleteProject"
  | "updateProjectConfig"
  | "incrementFileTreeRefreshVersion"
>;

/** Creates project-related workspace store actions and reconciles backend snapshots with in-memory UI state. */
export function createWorkspaceRepoActions(
  set: WorkspaceStoreSetState,
  _get: WorkspaceStoreGetState,
): WorkspaceRepoActions {
  const createProject = ({ name, source, path, gitUrl, backendRepo }: Parameters<WorkspaceStoreActions["createProject"]>[0]) => {
    const { normalizedPath, normalizedGitUrl, resolvedPath } = normalizeCreateRepoInput({
      path,
      gitUrl,
      source,
    });

    if (!name.trim() || !resolvedPath) {
      return;
    }

    if (!backendRepo?.id) {
      return;
    }

    set((state) =>
      buildCreatedRepoState(state, {
        name,
        source,
        normalizedPath,
        normalizedGitUrl,
        resolvedPath,
        backendRepo,
      }),
    );
  };

  return {
    load: (projects, workspaces, displayProjectIds) => {
      set((state) => buildHydratedStateFromApiData(state, projects, workspaces, displayProjectIds));
    },
    createProject,
    deleteProject: (projectId) => {
      if (!projectId) {
        return;
      }

      set((state) => buildDeletedRepoState(state, projectId));
    },
    updateProjectConfig: (projectId, config) => {
      set((state) => buildUpdatedRepoConfigState(state, projectId, config));
    },
    incrementFileTreeRefreshVersion: (workspaceWorktreePath, changedRelativePaths) => {
      const normalizedWorkspaceWorktreePath = workspaceWorktreePath?.trim() ?? "";
      const normalizedChangedRelativePaths = (changedRelativePaths ?? [])
        .map((path) => path.trim())
        .filter((path) => path.length > 0);

      set((state) => ({
        fileTreeRefreshVersion: state.fileTreeRefreshVersion + 1,
        fileTreeChangedRelativePathsByWorktreePath:
          normalizedWorkspaceWorktreePath.length === 0
            ? state.fileTreeChangedRelativePathsByWorktreePath
            : {
                ...state.fileTreeChangedRelativePathsByWorktreePath,
                [normalizedWorkspaceWorktreePath]: normalizedChangedRelativePaths,
              },
      }));
    },
  };
}
