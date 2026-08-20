import { workspaceStore } from "@renderer/domains/workspace";
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
import type { WorkspaceProjectRecord, WorkspaceStoreOrganizationPreference } from "../projectTypes";
import { DEFAULT_PROJECT_ICON_ID, PROJECT_COLOR_PRESETS, PROJECT_ICON_IDS } from "../ui/projectIconPresets";

/**
 * Random default icon/color assignment for new project records.
 *
 * State-transition machinery: `applyCreatedProjectState` must assign non-empty
 * avatar defaults, and `projectCommands.createProject` pre-assigns random ones
 * (new projects get random avatars). Both callers live in this Domain; the
 * policy sits beside the store transition that consumes it.
 */
export function pickRandomProjectIcon(): string {
  const iconId = PROJECT_ICON_IDS[Math.floor(Math.random() * PROJECT_ICON_IDS.length)];
  return iconId ?? DEFAULT_PROJECT_ICON_ID;
}

export function pickRandomProjectColor(): string {
  const preset = PROJECT_COLOR_PRESETS[Math.floor(Math.random() * PROJECT_COLOR_PRESETS.length)];
  return preset ?? "#1E66F5";
}

const LEGACY_WORKSPACE_STORE_KEY = "yishan-workspace-store";

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
  setOrganizationDisplayProjectIds: (organizationId: string, projectIds: string[]) => void;
  setLastUsedExternalAppId: (appId: ExternalAppId) => void;
  setWorkspaceListHierarchyMode: (mode: "by_project" | "by_node") => void;
};

/**
 * Legacy migration: reads persisted project preferences from the old
 * `yishan-workspace-store` key and returns them for the project store merge.
 * One-shot — the legacy fields are dropped from workspaceStore.partialize so
 * they stop being written; this reads whatever was already persisted.
 */
export function readLegacyWorkspacePrefs(): Partial<ProjectStoreState> | undefined {
  try {
    const raw = localStorage.getItem(LEGACY_WORKSPACE_STORE_KEY);
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

/** Writes the migrated project preferences before removing their legacy source. */
export function finalizeLegacyWorkspaceMigration(
  state: Pick<ProjectStoreState, "workspaceListHierarchyMode" | "setWorkspaceListHierarchyMode">,
): void {
  if (!localStorage.getItem(LEGACY_WORKSPACE_STORE_KEY)) {
    return;
  }
  state.setWorkspaceListHierarchyMode(state.workspaceListHierarchyMode);
  localStorage.removeItem(LEGACY_WORKSPACE_STORE_KEY);
}

/** Merges legacy workspace preferences as a fallback without overriding project-store state. */
export function mergeProjectStorePersistence(persisted: unknown, current: ProjectStoreState): ProjectStoreState {
  const legacy = readLegacyWorkspacePrefs();
  return {
    ...current,
    ...legacy,
    ...(persisted as Partial<ProjectStoreState>),
  };
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
      setOrganizationDisplayProjectIds: (organizationId, displayProjectIds) => {
        set((state) => {
          state.displayProjectIds = displayProjectIds;

          const normalizedOrganizationId = organizationId.trim();
          if (!normalizedOrganizationId) {
            return;
          }

          state.organizationPreferencesById ??= {};
          state.organizationPreferencesById[normalizedOrganizationId] ??= {};
          const organizationPreferences = state.organizationPreferencesById[normalizedOrganizationId];
          organizationPreferences.displayProjectIds = displayProjectIds;
          organizationPreferences.knownProjectIds = state.projects.map((project) => project.id);
        });
      },
      setLastUsedExternalAppId: (lastUsedExternalAppId) => {
        set({ lastUsedExternalAppId });
      },
      setWorkspaceListHierarchyMode: (workspaceListHierarchyMode) => {
        set({ workspaceListHierarchyMode });
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
      merge: mergeProjectStorePersistence,
      onRehydrateStorage: () => (state, error) => {
        if (!state || error) {
          return;
        }
        finalizeLegacyWorkspaceMigration(state);
      },
    },
  ),
);
