/**
 * Project store — owns project records + project preferences.
 *
 * Phase 3: project state leaves workspaceStore. This store is NOT a global
 * bucket: its actions mutate only the project slice (records + prefs). Cross-
 * owner effects (workspace removal, selection re-derivation, projection prune)
 * are decomposed at the command layer, never inside this store.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import {
  type RepoConfigUpdate,
  applyCreatedProjectState,
  applyDeletedProjectState,
  applyUpdatedRepoConfigState,
  normalizeCreateRepoInput,
} from "../../../helpers/projectHelpers";
import type { WorkspaceProjectRecord } from "./projectTypes";

export type WorkspaceStoreOrganizationPreference = {
  displayProjectIds?: string[];
  knownProjectIds?: string[];
  lastUsedExternalAppId?: ExternalAppId;
};

type ProjectStoreState = {
  projects: WorkspaceProjectRecord[];
  isProjectsLoaded: boolean;
  displayProjectIds: string[];
  lastUsedExternalAppId?: ExternalAppId;
  organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
  workspaceListHierarchyMode: "by_project" | "by_node";
  loadProjects: (
    organizationId: string,
    projects: WorkspaceProjectRecord[],
    displayProjectIds: string[],
    organizationPreferences: Record<string, WorkspaceStoreOrganizationPreference> | undefined,
    lastUsedExternalAppId: ExternalAppId | undefined,
  ) => void;
  createProject: (input: {
    name: string;
    source: "local" | "remote";
    path?: string;
    gitUrl?: string;
    backendProject: WorkspaceProjectRecord;
    organizationId: string;
  }) => void;
  deleteProject: (projectId: string) => void;
  updateProjectConfig: (projectId: string, config: RepoConfigUpdate) => void;
  setDisplayProjectIds: (projectIds: string[]) => void;
  setLastUsedExternalAppId: (appId: ExternalAppId) => void;
  setWorkspaceListHierarchyMode: (mode: "by_project" | "by_node") => void;
  setOrderedWorkspaceIds: (workspaceIds: string[]) => void;
};

/**
 * Legacy migration: reads persisted project preferences from the old
 * `yishan-workspace-store` key and returns them for the project store merge.
 * One-shot — the legacy fields are dropped from workspaceStore.partialize so
 * they stop being written; this reads whatever was already persisted.
 */
export function readLegacyWorkspacePrefs(): Partial<ProjectStoreState> | undefined {
  try {
    const raw = localStorage.getItem("yishan-workspace-store");
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      state?: {
        displayProjectIds?: string[];
        lastUsedExternalAppId?: ExternalAppId;
        organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
        workspaceListHierarchyMode?: "by_project" | "by_node";
      };
    };
    const legacyState = parsed.state;
    if (!legacyState) {
      return undefined;
    }
    return {
      displayProjectIds: legacyState.displayProjectIds,
      lastUsedExternalAppId: legacyState.lastUsedExternalAppId,
      organizationPreferencesById: legacyState.organizationPreferencesById,
      workspaceListHierarchyMode: legacyState.workspaceListHierarchyMode,
    };
  } catch {
    return undefined;
  }
}

const initialProjectState = {
  projects: [],
  isProjectsLoaded: false,
  displayProjectIds: [],
  lastUsedExternalAppId: undefined,
  organizationPreferencesById: undefined,
  workspaceListHierarchyMode: "by_project" as const,
};

export const projectStore = create<ProjectStoreState>()(
  persist(
    immer((set) => ({
      ...initialProjectState,
      loadProjects: (organizationId, projects, displayProjectIds, organizationPreferences, lastUsedExternalAppId) => {
        set((state) => {
          state.projects = projects;
          state.isProjectsLoaded = true;
          state.displayProjectIds = displayProjectIds;
          if (organizationId.trim()) {
            state.organizationPreferencesById = organizationPreferences;
          }
          state.lastUsedExternalAppId = lastUsedExternalAppId;
        });
      },
      createProject: ({ name, source, path, gitUrl, backendProject, organizationId }) => {
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

        set((state) => {
          applyCreatedProjectState(state, {
            name,
            source,
            normalizedPath,
            normalizedGitUrl,
            resolvedPath,
            backendProject,
          });

          // Persist display preferences into organization-scoped storage.
          const normalizedOrganizationId = organizationId.trim();
          if (normalizedOrganizationId) {
            state.organizationPreferencesById ??= {};
            state.organizationPreferencesById[normalizedOrganizationId] ??= {};
            const orgPrefs = state.organizationPreferencesById[normalizedOrganizationId];
            orgPrefs.displayProjectIds = state.displayProjectIds;
            orgPrefs.knownProjectIds = state.projects.map((project) => project.id);
          }
        });
      },
      deleteProject: (projectId) => {
        if (!projectId) {
          return;
        }

        set((state) => {
          applyDeletedProjectState(state, projectId);
        });
      },
      updateProjectConfig: (projectId, config) => {
        set((state) => {
          applyUpdatedRepoConfigState(state, projectId, config);
        });
      },
      setDisplayProjectIds: (displayProjectIds) => {
        set({ displayProjectIds });
      },
      setLastUsedExternalAppId: (lastUsedExternalAppId) => {
        set({ lastUsedExternalAppId });
      },
      setWorkspaceListHierarchyMode: (workspaceListHierarchyMode) => {
        set({ workspaceListHierarchyMode });
      },
      setOrderedWorkspaceIds: () => {
        // Ordering is workspace-list UI state; kept on workspaceStore.
      },
    })),
    {
      name: "yishan-project-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        displayProjectIds: state.displayProjectIds,
        lastUsedExternalAppId: state.lastUsedExternalAppId,
        organizationPreferencesById: state.organizationPreferencesById,
        workspaceListHierarchyMode: state.workspaceListHierarchyMode,
      }),
      merge: (persisted, current) => {
        const legacy = readLegacyWorkspacePrefs();
        return {
          ...current,
          ...(persisted as Partial<ProjectStoreState>),
          ...legacy,
        };
      },
    },
  ),
);
