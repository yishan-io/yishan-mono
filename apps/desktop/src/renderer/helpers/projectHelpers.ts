import type { ProjectRecord, WorkspaceRecord } from "../api/types";
import { buildWorkspaceStateFromData } from "../store/workspace/state";
import { getFileName } from "../store/tabs";
import type {
  WorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
  WorkspaceStoreState,
} from "../store/types";

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
  "name" | "worktreePath" | "contextEnabled" | "icon" | "color" | "setupScript" | "postScript"
>;

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
        selectedProjectId?: unknown;
        selectedWorkspaceId?: unknown;
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
        selectedProjectId:
          typeof scopedPreferences.selectedProjectId === "string" ? scopedPreferences.selectedProjectId : undefined,
        selectedWorkspaceId:
          typeof scopedPreferences.selectedWorkspaceId === "string" ? scopedPreferences.selectedWorkspaceId : undefined,
        displayProjectIds: Array.isArray(scopedPreferences.displayProjectIds)
          ? scopedPreferences.displayProjectIds.filter((item): item is string => typeof item === "string")
          : undefined,
        lastUsedExternalAppId:
          typeof scopedPreferences.lastUsedExternalAppId === "string"
            ? (scopedPreferences.lastUsedExternalAppId as WorkspaceStoreOrganizationPreference["lastUsedExternalAppId"])
            : undefined,
      };
    }

    return {
      selectedProjectId:
        typeof parsed.state?.selectedProjectId === "string" ? parsed.state.selectedProjectId : undefined,
      selectedWorkspaceId:
        typeof parsed.state?.selectedWorkspaceId === "string" ? parsed.state.selectedWorkspaceId : undefined,
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
    } satisfies WorkspaceProjectRecord;
  });

  const projectIdSet = new Set(mappedProjects.map((project) => project.id));
  const managedWorkspaces = workspacesFromApi
    .filter((workspace) => {
      const parentId = workspace.projectId ?? "";
      return projectIdSet.has(parentId);
    })
    .map(
      (workspace) =>
        ({
          id: workspace.id,
          organizationId: workspace.organizationId,
          projectId: workspace.projectId,
          repoId: workspace.projectId,
          name: workspace.kind === "primary" ? "local" : (workspace.branch ?? "workspace"),
          title:
            workspace.kind === "primary"
              ? "local"
              : getFileName(workspace.localPath ?? "") || workspace.branch || "workspace",
          sourceBranch: workspace.sourceBranch ?? "",
          branch: workspace.branch ?? "main",
          summaryId: workspace.id,
          worktreePath: workspace.localPath,
          nodeId: workspace.nodeId,
          kind: "managed",
        }) satisfies WorkspaceItem,
    );

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
  const { projects: mappedProjects, workspaces } = mapApiData(projects, workspacesFromApi);
  const nextBaseState = buildWorkspaceStateFromData({
    projects: mappedProjects,
    workspaces,
    preferredProjectId: orgPreferences?.selectedProjectId,
    preferredWorkspaceId: orgPreferences?.selectedWorkspaceId,
  });

  const nextProjectIdSet = new Set(mappedProjects.map((project) => project.id));
  const previousProjectIdSet = new Set(state.projects.map((project) => project.id));
  const baseDisplayProjectIds = orgPreferences?.displayProjectIds ?? [];
  const filteredDisplayProjectIds = baseDisplayProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
  const discoveredProjectIds =
    state.projects.length > 0
      ? mappedProjects
          .map((project) => project.id)
          .filter((projectId) => !baseDisplayProjectIds.includes(projectId) && !previousProjectIdSet.has(projectId))
      : [];
  const hasNoPersistedPreference =
    orgPreferences?.displayProjectIds === undefined || orgPreferences.displayProjectIds.length === 0;
  const shouldResetPersistedDisplayProjectIds =
    orgPreferences?.displayProjectIds !== undefined &&
    orgPreferences.displayProjectIds.length > 0 &&
    filteredDisplayProjectIds.length === 0 &&
    mappedProjects.length > 0;
  const nextDisplayProjectIds =
    hasNoPersistedPreference && mappedProjects.length > 0
      ? mappedProjects.map((project) => project.id)
      : shouldResetPersistedDisplayProjectIds
        ? mappedProjects.map((project) => project.id)
        : [...filteredDisplayProjectIds, ...discoveredProjectIds];

  state.projects = nextBaseState.projects;
  state.workspaces = nextBaseState.workspaces;
  state.selectedProjectId = nextBaseState.selectedProjectId;
  state.selectedWorkspaceId = nextBaseState.selectedWorkspaceId;
  state.displayProjectIds = nextDisplayProjectIds;
  state.lastUsedExternalAppId = orgPreferences?.lastUsedExternalAppId;

  if (normalizedOrganizationId.length > 0) {
    state.organizationPreferencesById ??= {};
    state.organizationPreferencesById[normalizedOrganizationId] = {
      selectedProjectId: nextBaseState.selectedProjectId,
      selectedWorkspaceId: nextBaseState.selectedWorkspaceId,
      displayProjectIds: nextDisplayProjectIds,
      lastUsedExternalAppId: orgPreferences?.lastUsedExternalAppId,
    };
  }

  const nextWorkspaceIdSet = new Set(workspaces.map((workspace) => workspace.id));
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

  // Populate latestPullRequest from the api-service workspace list.
  const nextLatestPrByWorkspaceId: WorkspaceStoreState["latestPullRequestByWorkspaceId"] = {};
  for (const workspace of workspacesFromApi) {
    if (workspace.latestPullRequest) {
      nextLatestPrByWorkspaceId[workspace.id] = workspace.latestPullRequest;
    }
  }
  state.latestPullRequestByWorkspaceId = nextLatestPrByWorkspaceId;
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
}
