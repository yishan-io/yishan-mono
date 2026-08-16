import type { ProjectRecord, WorkspaceRecord } from "../api/types";
import { pickRandomProjectColor, pickRandomProjectIcon } from "../features/project/model/projectIconPresets";
import { type ProjectStoreSlice, reconcileWorkspaceSnapshot } from "../features/workspace/model/snapshotReconciler";
import { getFileName } from "../store/tabs";
import type {
  WorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
  WorkspaceStoreState,
} from "../store/types";
import { resolveHydratedWorkspaceDisplayMetadata } from "./workspaceDisplayNames";

export type RepoConfigUpdate = Pick<
  WorkspaceProjectRecord,
  "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript" | "commands"
>;

function resolveWorkspaceProjectId(workspace: Pick<WorkspaceItem, "projectId" | "repoId">): string {
  return workspace.projectId ?? workspace.repoId;
}

/** Returns projects that are currently visible in UI order, based on `displayProjectIds`. */
export function filterVisibleProjects<T extends { id: string }>(projects: T[], displayProjectIds: string[]): T[] {
  return projects.filter((project) => displayProjectIds.includes(project.id));
}

/** Returns persisted workspace preferences for one organization id when available. */
export function readPersistedWorkspacePreferencesByOrg(
  storage: Storage | undefined,
  organizationId: string,
): WorkspaceStoreOrganizationPreference | undefined {
  if (!storage) {
    return undefined;
  }

  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    return undefined;
  }

  try {
    const raw = storage.getItem("yishan-workspace-store");
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as {
      state?: {
        displayProjectIds?: unknown;
        lastUsedExternalAppId?: unknown;
        organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
      };
    };
    const organizationPreferencesById = parsed.state?.organizationPreferencesById;
    if (organizationPreferencesById && typeof organizationPreferencesById === "object") {
      const scopedPreferences = organizationPreferencesById[normalizedOrganizationId];
      if (!scopedPreferences || typeof scopedPreferences !== "object") {
        return undefined;
      }

      return {
        displayProjectIds: Array.isArray(scopedPreferences.displayProjectIds)
          ? scopedPreferences.displayProjectIds.filter((item): item is string => typeof item === "string")
          : undefined,
        knownProjectIds: Array.isArray(scopedPreferences.knownProjectIds)
          ? scopedPreferences.knownProjectIds.filter((item): item is string => typeof item === "string")
          : undefined,
        lastUsedExternalAppId:
          typeof scopedPreferences.lastUsedExternalAppId === "string"
            ? (scopedPreferences.lastUsedExternalAppId as WorkspaceStoreOrganizationPreference["lastUsedExternalAppId"])
            : undefined,
      };
    }

    return {
      displayProjectIds: Array.isArray(parsed.state?.displayProjectIds)
        ? parsed.state.displayProjectIds.filter((item): item is string => typeof item === "string")
        : undefined,
      lastUsedExternalAppId:
        typeof parsed.state?.lastUsedExternalAppId === "string"
          ? (parsed.state.lastUsedExternalAppId as WorkspaceStoreOrganizationPreference["lastUsedExternalAppId"])
          : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Returns only entries keyed by workspace ids that still exist after snapshot reconciliation. */

/** Maps backend API data into workspace projects and open workspaces. */

/** Reconciles current state with backend snapshot while preserving compatible UI-only state. */
export function applyHydratedStateFromApiData(
  state: ProjectStoreSlice,
  organizationId: string,
  projects: ProjectRecord[],
  workspacesFromApi: WorkspaceRecord[],
): void {
  // Phase 3: pure reconciliation now lives in the snapshot reconciler. This
  // wrapper keeps existing callers and tests green; the coordinator
  // (features/workspace/model/applySnapshot.ts) applies the result to stores.
  const result = reconcileWorkspaceSnapshot({
    projects,
    workspacesFromApi,
    organizationId,
    previousState: state,
  });
  state.projects = result.projects;
  state.workspaces = result.workspaces;
  state.selectedProjectId = result.selectedProjectId;
  state.selectedWorkspaceId = result.selectedWorkspaceId;
  state.displayProjectIds = result.displayProjectIds;
  state.lastUsedExternalAppId = result.lastUsedExternalAppId;
  state.organizationPreferencesById = result.organizationPreferencesById;
  state.gitChangesCountByWorkspaceId = result.projectionCleanup.gitChangesCountByWorkspaceId;
  state.gitChangeTotalsByWorkspaceId = result.projectionCleanup.gitChangeTotalsByWorkspaceId;
  state.pullRequestByWorkspaceId = result.projectionCleanup.pullRequestByWorkspaceId;
  state.latestPullRequestByWorkspaceId = result.projectionCleanup.latestPullRequestByWorkspaceId;
}

export function normalizeCreateRepoInput(input: {
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

/** Applies optimistic local state for a newly created repo. */
export function applyCreatedRepoState(
  state: ProjectStoreSlice,
  input: {
    name: string;
    source: "local" | "remote";
    normalizedPath: string;
    normalizedGitUrl: string;
    resolvedPath: string;
    backendProject: WorkspaceProjectRecord;
  },
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
  state.selectedProjectId = nextRepoId;
  state.selectedWorkspaceId = "";
}

/** Removes a repo and all workspace-scoped UI state derived from that repo. */
/**
 * Project-slice-only create: appends the project + display id. Selection is
 * set by the command layer (project store must not touch workspace selection).
 */
export function applyCreatedProjectState(
  state: { projects: WorkspaceProjectRecord[]; displayProjectIds: string[] },
  input: Parameters<typeof applyCreatedRepoState>[1],
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

export function applyDeletedRepoState(state: ProjectStoreSlice, repoId: string): void {
  state.projects = state.projects.filter((project) => project.id !== repoId);
  const deletedWorkspaceIdSet = new Set(
    state.workspaces
      .filter((workspace) => (workspace.projectId ?? workspace.repoId) === repoId)
      .map((workspace) => workspace.id),
  );
  state.workspaces = state.workspaces.filter((workspace) => (workspace.projectId ?? workspace.repoId) !== repoId);
  state.displayProjectIds = (state.displayProjectIds ?? []).filter((id) => id !== repoId);

  for (const workspaceId of deletedWorkspaceIdSet) {
    delete state.gitChangesCountByWorkspaceId[workspaceId];
    delete state.gitChangeTotalsByWorkspaceId[workspaceId];
  }

  if (state.selectedProjectId === repoId) {
    state.selectedProjectId = state.projects[0]?.id ?? "";
  }

  if (!state.workspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)) {
    const nextSelectedWorkspaceId =
      state.workspaces.find((workspace) => (workspace.projectId ?? workspace.repoId) === state.selectedProjectId)?.id ??
      state.workspaces[0]?.id ??
      "";
    state.selectedWorkspaceId = nextSelectedWorkspaceId;
  }
}

/** Applies repo config updates to local state after save attempts. */
/**
 * Project-slice-only delete: removes the project + its display-project id.
 * Workspace removal, selection re-derivation, and projection pruning are
 * decomposed at the command layer (the project store must not become a global
 * bucket).
 */
export function applyDeletedProjectState(
  state: { projects: WorkspaceProjectRecord[]; displayProjectIds: string[] },
  projectId: string,
): void {
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.displayProjectIds = state.displayProjectIds.filter((id) => id !== projectId);
}

export function applyUpdatedRepoConfigState(
  state: Pick<WorkspaceStoreState, "projects">,
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
