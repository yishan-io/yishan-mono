import {
  applyCreatedRepoState,
  applyDeletedRepoState,
  applyHydratedStateFromApiData,
  applyUpdatedRepoConfigState,
  normalizeCreateRepoInput,
} from "../../helpers/projectHelpers";
import type { WorkspaceStoreActions, WorkspaceStoreGetState, WorkspaceStoreSetState } from "../types";

type WorkspaceRepoActions = Pick<
  WorkspaceStoreActions,
  "load" | "createProject" | "deleteProject" | "updateProjectConfig" | "incrementFileTreeRefreshVersion"
>;

function isGitInternalPath(path: string): boolean {
  return path === ".git" || path.startsWith(".git/");
}

/** Creates project-related workspace store actions and reconciles backend snapshots with in-memory UI state. */
export function createWorkspaceRepoActions(
  set: WorkspaceStoreSetState,
  _get: WorkspaceStoreGetState,
): WorkspaceRepoActions {
  const createProject = ({
    name,
    source,
    path,
    gitUrl,
    backendProject,
    organizationId,
  }: Parameters<WorkspaceStoreActions["createProject"]>[0]) => {
    const { normalizedPath, normalizedGitUrl, resolvedPath } = normalizeCreateRepoInput({
      path,
      gitUrl,
      source,
    });

    if (!name.trim() || !resolvedPath) {
      return;
    }

    if (!backendProject?.id) {
      return;
    }

    const normalizedOrganizationId = organizationId.trim();

    set((state) => {
      applyCreatedRepoState(state, {
        name,
        source,
        normalizedPath,
        normalizedGitUrl,
        resolvedPath,
        backendProject,
      });

      // Persist display preferences into organization-scoped storage.
      if (normalizedOrganizationId) {
        state.organizationPreferencesById ??= {};
        state.organizationPreferencesById[normalizedOrganizationId] ??= {};
        const orgPrefs = state.organizationPreferencesById[normalizedOrganizationId];
        orgPrefs.displayProjectIds = state.displayProjectIds;
        orgPrefs.knownProjectIds = state.projects.map((project) => project.id);
      }
    });
  };

  return {
    load: (organizationId, projects, workspaces) => {
      set((state) => {
        applyHydratedStateFromApiData(state, organizationId, projects, workspaces);
        state.isProjectsLoaded = true;
      });
    },
    createProject,
    deleteProject: (projectId) => {
      if (!projectId) {
        return;
      }

      set((state) => {
        applyDeletedRepoState(state, projectId);
      });
    },
    updateProjectConfig: (projectId, config) => {
      set((state) => {
        applyUpdatedRepoConfigState(state, projectId, config);
      });
    },
    incrementFileTreeRefreshVersion: (workspaceWorktreePath, changedRelativePaths) => {
      const normalizedWorkspaceWorktreePath = workspaceWorktreePath?.trim() ?? "";
      if (normalizedWorkspaceWorktreePath.length === 0) {
        return;
      }

      const normalizedChangedRelativePaths = (changedRelativePaths ?? [])
        .map((path) => path.trim())
        .filter((path) => path.length > 0 && !isGitInternalPath(path));

      set((state) => {
        state.fileTreeRefreshVersion += 1;
        state.fileTreeChangedRelativePathsByWorktreePath[normalizedWorkspaceWorktreePath] =
          normalizedChangedRelativePaths;
      });
    },
  };
}
