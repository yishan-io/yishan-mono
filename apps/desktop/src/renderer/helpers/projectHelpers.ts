import type { ProjectRecord, WorkspaceRecord } from "../api/types";
import { getFileName } from "../store/tabs";
import type {
  WorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
  WorkspaceStoreState,
} from "../store/types";
import { buildWorkspaceStateFromData } from "../store/workspace/state";
import { resolveHydratedWorkspaceDisplayMetadata } from "./workspaceDisplayNames";

type ProjectStoreSlice = Pick<
  WorkspaceStoreState,
  | "projects"
  | "workspaces"
  | "pullRequestByWorkspaceId"
  | "latestPullRequestByWorkspaceId"
  | "gitChangesCountByWorkspaceId"
  | "gitChangeTotalsByWorkspaceId"
  | "selectedProjectId"
  | "selectedWorkspaceId"
  | "displayProjectIds"
  | "lastUsedExternalAppId"
  | "organizationPreferencesById"
>;

type RepoConfigUpdate = Pick<
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
function filterWorkspaceScopedRecord<T>(record: Record<string, T>, workspaceIdSet: Set<string>): Record<string, T> {
  for (const key of Object.keys(record)) {
    if (!workspaceIdSet.has(key)) {
      delete record[key];
    }
  }
  return record;
}

function resolveNextDisplayProjectIds(input: {
  mappedProjects: WorkspaceProjectRecord[];
  orgPreferences: WorkspaceStoreOrganizationPreference | undefined;
  previousProjects: WorkspaceProjectRecord[];
}): string[] {
  const nextProjectIdSet = new Set(input.mappedProjects.map((project) => project.id));
  const previousProjectIdSet = new Set(input.previousProjects.map((project) => project.id));
  const persistedKnownProjectIds = input.orgPreferences?.knownProjectIds;
  const knownProjectIdSet =
    previousProjectIdSet.size > 0
      ? previousProjectIdSet
      : persistedKnownProjectIds !== undefined
        ? new Set(persistedKnownProjectIds)
        : undefined;
  const baseDisplayProjectIds = input.orgPreferences?.displayProjectIds ?? [];
  const filteredDisplayProjectIds = baseDisplayProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
  const discoveredProjectIds =
    knownProjectIdSet !== undefined
      ? input.mappedProjects
          .map((project) => project.id)
          .filter((projectId) => !baseDisplayProjectIds.includes(projectId) && !knownProjectIdSet.has(projectId))
      : [];
  const hasNoPersistedPreference =
    input.orgPreferences?.displayProjectIds === undefined || input.orgPreferences.displayProjectIds.length === 0;
  const shouldResetPersistedDisplayProjectIds =
    input.orgPreferences?.displayProjectIds !== undefined &&
    input.orgPreferences.displayProjectIds.length > 0 &&
    filteredDisplayProjectIds.length === 0 &&
    input.mappedProjects.length > 0;

  return hasNoPersistedPreference && input.mappedProjects.length > 0
    ? input.mappedProjects.map((project) => project.id)
    : shouldResetPersistedDisplayProjectIds
      ? input.mappedProjects.map((project) => project.id)
      : [...filteredDisplayProjectIds, ...discoveredProjectIds];
}

function resolveHydratedSelection(input: {
  workspaces: WorkspaceItem[];
  previousSelectedProjectId: string;
  previousSelectedWorkspaceId: string;
  mappedProjects: WorkspaceProjectRecord[];
  displayProjectIds: string[];
}): { selectedProjectId: string; selectedWorkspaceId: string } {
  const displayedProjectIdSet = new Set(input.displayProjectIds);
  const fallbackSelectedWorkspace = input.workspaces.find((workspace) =>
    displayedProjectIdSet.has(resolveWorkspaceProjectId(workspace)),
  );
  const fallbackSelectedProjectId =
    (fallbackSelectedWorkspace ? resolveWorkspaceProjectId(fallbackSelectedWorkspace) : undefined) ??
    input.mappedProjects.find((project) => displayedProjectIdSet.has(project.id))?.id ??
    "";
  const preservedSelectedWorkspace = input.workspaces.find(
    (workspace) =>
      workspace.id === input.previousSelectedWorkspaceId &&
      displayedProjectIdSet.has(resolveWorkspaceProjectId(workspace)),
  );
  const selectedProjectId = preservedSelectedWorkspace
    ? resolveWorkspaceProjectId(preservedSelectedWorkspace)
    : displayedProjectIdSet.has(input.previousSelectedProjectId)
      ? input.previousSelectedProjectId
      : fallbackSelectedProjectId;
  const selectedWorkspaceId =
    preservedSelectedWorkspace?.id ??
    input.workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === selectedProjectId)?.id ??
    "";

  return {
    selectedProjectId,
    selectedWorkspaceId,
  };
}

function resolvePreservedHydrationWorkspaces(
  previousWorkspaces: WorkspaceItem[],
  workspaces: WorkspaceItem[],
): WorkspaceItem[] {
  const apiWorkspaceIdSet = new Set(workspaces.map((workspace) => workspace.id));
  return previousWorkspaces.filter((workspace) => {
    if (apiWorkspaceIdSet.has(workspace.id)) {
      return false;
    }

    return !workspace.worktreePath || workspace.preserveOnMissingSnapshot === true;
  });
}

function preservePendingWorkspaceDisplayMetadata(
  workspaces: WorkspaceItem[],
  previousWorkspaces: WorkspaceItem[],
): WorkspaceItem[] {
  const previousWorkspaceById = new Map(previousWorkspaces.map((workspace) => [workspace.id, workspace]));

  return workspaces.map((workspace) => {
    const previousWorkspace = previousWorkspaceById.get(workspace.id);
    if (!previousWorkspace) {
      return workspace;
    }

    const previousPath = previousWorkspace.worktreePath?.trim() ?? "";
    const hydratedPath = workspace.worktreePath?.trim() ?? "";
    const hasPreviousPlaceholderPath = !previousPath;
    const hasHydratedPath = Boolean(hydratedPath);
    const isProvisioning = workspace.status === "provisioning" || previousWorkspace.status === "provisioning";
    if (!hasPreviousPlaceholderPath && previousWorkspace.status === "active" && !hasHydratedPath) {
      return {
        ...workspace,
        name: previousWorkspace.name,
        title: previousWorkspace.title,
        status: previousWorkspace.status,
        worktreePath: previousWorkspace.worktreePath,
      };
    }

    if (!hasPreviousPlaceholderPath || hasHydratedPath || !isProvisioning) {
      return workspace;
    }

    return {
      ...workspace,
      name: previousWorkspace.name,
      title: previousWorkspace.title,
    };
  });
}

function buildLatestPullRequestByWorkspaceId(
  workspacesFromApi: WorkspaceRecord[],
): WorkspaceStoreState["latestPullRequestByWorkspaceId"] {
  const nextLatestPrByWorkspaceId: WorkspaceStoreState["latestPullRequestByWorkspaceId"] = {};
  for (const workspace of workspacesFromApi) {
    if (workspace.latestPullRequest) {
      nextLatestPrByWorkspaceId[workspace.id] = workspace.latestPullRequest;
    }
  }
  return nextLatestPrByWorkspaceId;
}

/** Maps backend API data into workspace projects and open workspaces. */
function mapApiData(
  projects: ProjectRecord[],
  workspacesFromApi: WorkspaceRecord[],
): {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
} {
  const preferredWorkspaceByProjectId = new Map<string, WorkspaceRecord>();
  for (const workspace of workspacesFromApi) {
    const projectId = workspace.projectId?.trim();
    if (!projectId) {
      continue;
    }

    const existing = preferredWorkspaceByProjectId.get(projectId);
    if (!existing || (workspace.kind === "primary" && existing.kind !== "primary")) {
      preferredWorkspaceByProjectId.set(projectId, workspace);
    }
  }

  const mappedProjects = projects.map((repo) => {
    const preferredWorkspace = preferredWorkspaceByProjectId.get(repo.id);
    const path = preferredWorkspace?.localPath?.trim() ?? "";
    const displayName = repo.name?.trim() || (path ? getFileName(path) : repo.id);
    return {
      ...repo,
      key: repo.repoKey ?? repo.id,
      name: displayName,
      path,
      missing: !path,
      gitUrl: repo.repoUrl ?? "",
      localPath: path,
      worktreePath: path,
      contextEnabled: repo.contextEnabled,
      defaultBranch: preferredWorkspace?.branch ?? "",
      icon: repo.icon,
      color: repo.color,
      setupScript: repo.setupScript,
      postScript: repo.postScript,
      commands: repo.commands,
    } satisfies WorkspaceProjectRecord;
  });

  const projectIdSet = new Set(mappedProjects.map((project) => project.id));
  const managedWorkspaces = workspacesFromApi
    .filter((workspace) => {
      const parentId = workspace.projectId ?? "";
      return projectIdSet.has(parentId);
    })
    .map((workspace) => {
      const displayMetadata = resolveHydratedWorkspaceDisplayMetadata(workspace);
      return {
        id: workspace.id,
        organizationId: workspace.organizationId,
        projectId: workspace.projectId,
        repoId: workspace.projectId,
        name: displayMetadata.name,
        title: displayMetadata.title,
        sourceBranch: workspace.sourceBranch ?? "",
        branch: workspace.branch ?? "main",
        summaryId: workspace.id,
        worktreePath: workspace.localPath,
        nodeId: workspace.nodeId,
        kind: "managed",
        status: workspace.status,
      } satisfies WorkspaceItem;
    });

  return {
    projects: mappedProjects,
    workspaces: managedWorkspaces,
  };
}

/** Reconciles current state with backend snapshot while preserving compatible UI-only state. */
export function applyHydratedStateFromApiData(
  state: ProjectStoreSlice,
  organizationId: string,
  projects: ProjectRecord[],
  workspacesFromApi: WorkspaceRecord[],
): void {
  const normalizedOrganizationId = organizationId.trim();
  const orgPreferences =
    normalizedOrganizationId.length > 0 ? state.organizationPreferencesById?.[normalizedOrganizationId] : undefined;
  const previousSelectedProjectId = state.selectedProjectId;
  const previousSelectedWorkspaceId = state.selectedWorkspaceId;
  const { projects: mappedProjects, workspaces } = mapApiData(projects, workspacesFromApi);
  const reconciledWorkspaces = preservePendingWorkspaceDisplayMetadata(workspaces, state.workspaces);
  const nextBaseState = buildWorkspaceStateFromData({
    projects: mappedProjects,
    workspaces: reconciledWorkspaces,
  });
  const nextDisplayProjectIds = resolveNextDisplayProjectIds({
    mappedProjects,
    orgPreferences,
    previousProjects: state.projects,
  });
  // Preserve workspaces that are still being created locally (pending with no
  // worktreePath) and just-created local workspaces marked for transient
  // missing-snapshot protection. Without this, a workspaceSnapshotChanged event
  // triggered during async creation can replace the store and destroy the
  // visible workspace row before a later authoritative snapshot includes it.
  const preservedWorkspaces = resolvePreservedHydrationWorkspaces(state.workspaces, reconciledWorkspaces);
  const nextWorkspaces = [...nextBaseState.workspaces, ...preservedWorkspaces];
  const nextSelection = resolveHydratedSelection({
    workspaces: nextWorkspaces,
    previousSelectedProjectId,
    previousSelectedWorkspaceId,
    mappedProjects,
    displayProjectIds: nextDisplayProjectIds,
  });

  state.projects = nextBaseState.projects;
  state.workspaces = nextWorkspaces;
  state.selectedProjectId = nextSelection.selectedProjectId;
  state.selectedWorkspaceId = nextSelection.selectedWorkspaceId;
  state.displayProjectIds = nextDisplayProjectIds;
  state.lastUsedExternalAppId = orgPreferences?.lastUsedExternalAppId;

  if (normalizedOrganizationId.length > 0) {
    state.organizationPreferencesById ??= {};
    state.organizationPreferencesById[normalizedOrganizationId] = {
      displayProjectIds: nextDisplayProjectIds,
      knownProjectIds: mappedProjects.map((project) => project.id),
      lastUsedExternalAppId: orgPreferences?.lastUsedExternalAppId,
    };
  }

  const nextWorkspaceIdSet = new Set(nextWorkspaces.map((workspace) => workspace.id));
  state.gitChangesCountByWorkspaceId = filterWorkspaceScopedRecord(
    { ...(state.gitChangesCountByWorkspaceId ?? {}) },
    nextWorkspaceIdSet,
  );
  state.gitChangeTotalsByWorkspaceId = filterWorkspaceScopedRecord(
    { ...(state.gitChangeTotalsByWorkspaceId ?? {}) },
    nextWorkspaceIdSet,
  );
  state.pullRequestByWorkspaceId = filterWorkspaceScopedRecord(
    { ...(state.pullRequestByWorkspaceId ?? {}) },
    nextWorkspaceIdSet,
  );

  state.latestPullRequestByWorkspaceId = buildLatestPullRequestByWorkspaceId(workspacesFromApi);
}

/** Normalizes create-repo input and returns empty strings when invalid. */
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
    icon: input.backendProject.icon ?? "folder",
    color: input.backendProject.color ?? "#1E66F5",
    setupScript: input.backendProject.setupScript ?? "",
    postScript: input.backendProject.postScript ?? "",
    commands: input.backendProject.commands ?? [],
    sourceType: input.source === "local" ? "git-local" : "git",
    repoProvider: input.backendProject.repoProvider ?? null,
    repoUrl: (input.backendProject.repoUrl ?? (input.source === "remote" ? input.normalizedGitUrl : "")) || null,
    repoKey: input.backendProject.repoKey ?? input.backendProject.key ?? nextRepoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdByUserId: "",
  } satisfies WorkspaceProjectRecord;

  state.projects.push(nextProject);
  state.displayProjectIds = [...currentDisplayProjectIds, nextRepoId];
  state.selectedProjectId = nextRepoId;
  state.selectedWorkspaceId = "";
}

/** Removes a repo and all workspace-scoped UI state derived from that repo. */
export function applyDeletedRepoState(state: ProjectStoreSlice, repoId: string): void {
  state.projects = state.projects.filter((project) => project.id !== repoId);
  const deletedWorkspaceIdSet = new Set(
    state.workspaces
      .filter((workspace) => (workspace.projectId ?? workspace.repoId) === repoId)
      .map((workspace) => workspace.id),
  );
  state.workspaces = state.workspaces.filter((workspace) => (workspace.projectId ?? workspace.repoId) !== repoId);
  state.displayProjectIds = state.displayProjectIds.filter((id) => id !== repoId);

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
