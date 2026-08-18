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
import { pickRandomProjectColor, pickRandomProjectIcon } from "../model/projectIconPresets";
import type { WorkspaceProjectRecord } from "../model/projectTypes";

export type WorkspaceStoreOrganizationPreference = {
  displayProjectIds?: string[];
  knownProjectIds?: string[];
  lastUsedExternalAppId?: ExternalAppId;
};

export type ProjectStoreState = {
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

type CreatedProjectInput = {
  name: string;
  source: "local" | "remote";
  normalizedPath: string;
  normalizedGitUrl: string;
  resolvedPath: string;
  backendProject: WorkspaceProjectRecord;
};

type RepoConfigUpdate = Pick<
  WorkspaceProjectRecord,
  "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript" | "commands"
>;

/** Normalizes one create-project input into trimmed path/gitUrl plus a resolved source path. */
function normalizeCreateRepoInput(input: {
  path?: string;
  gitUrl?: string;
  source: "local" | "remote";
}): { normalizedPath: string; normalizedGitUrl: string; resolvedPath: string } {
  const normalizedPath = input.path?.trim() ?? "";
  const normalizedGitUrl = input.gitUrl?.trim() ?? "";
  return {
    normalizedPath,
    normalizedGitUrl,
    resolvedPath: input.source === "local" ? normalizedPath : normalizedGitUrl || normalizedPath,
  };
}

/** Applies repo config updates to local state after save attempts. */
function applyUpdatedRepoConfigState(
  state: Pick<ProjectStoreState, "projects">,
  repoId: string,
  config: RepoConfigUpdate,
): void {
  const project = state.projects.find((project) => project.id === repoId);
  if (!project) {
    return;
  }

  project.name = config.name;
  project.worktreePath = config.worktreePath ?? project.worktreePath;
  project.contextEnabled = config.contextEnabled ?? project.contextEnabled;
  project.icon = config.icon ?? project.icon;
  project.color = config.color ?? project.color;
  project.setupScript = config.setupScript ?? project.setupScript;
  project.postScript = config.postScript ?? project.postScript;
  project.commands = config.commands ?? project.commands;
}

/** Project-slice create: appends the project + display id. Selection is set by the command layer. */
function applyCreatedProjectState(
  state: { projects: WorkspaceProjectRecord[]; displayProjectIds: string[] },
  input: CreatedProjectInput,
): void {
  const currentDisplayProjectIds = state.displayProjectIds;
  const nextRepoId = input.backendProject.id;
  const repoPath = (input.backendProject.localPath ?? input.resolvedPath).trim();
  const nextProject = {
    id: nextRepoId,
    key: input.backendProject.key ?? input.backendProject.repoKey ?? nextRepoId,
    name: input.name.trim(),
    path: repoPath,
    missing: false,
    gitUrl: input.backendProject.gitUrl ?? (input.source === "remote" ? input.normalizedGitUrl : ""),
    localPath: input.source === "local" ? repoPath : "",
    worktreePath: input.backendProject.worktreePath ?? (input.source === "local" ? repoPath : ""),
    contextEnabled: input.backendProject.contextEnabled ?? true,
    defaultBranch: input.backendProject.defaultBranch ?? "",
    icon: input.backendProject.icon || pickRandomProjectIcon(),
    color: input.backendProject.color || pickRandomProjectColor(),
    setupScript: input.backendProject.setupScript ?? "",
    postScript: input.backendProject.postScript ?? "",
    commands: input.backendProject.commands ?? [],
    sourceType: input.backendProject.sourceType ?? (input.source === "local" ? "git-local" : "git"),
    repoProvider: input.backendProject.repoProvider ?? null,
    repoUrl: (input.backendProject.repoUrl ?? (input.source === "remote" ? input.normalizedGitUrl : "")) || null,
    repoKey: input.backendProject.repoKey ?? input.backendProject.key ?? nextRepoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdByUserId: "",
  } satisfies WorkspaceProjectRecord;

  state.projects.push(nextProject);
  state.displayProjectIds = [...(currentDisplayProjectIds ?? []), nextRepoId];
}

/** Project-slice delete: removes the project + its display-project id. */
function applyDeletedProjectState(
  state: { projects: WorkspaceProjectRecord[]; displayProjectIds: string[] },
  projectId: string,
): void {
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.displayProjectIds = state.displayProjectIds.filter((id) => id !== projectId);
}

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
