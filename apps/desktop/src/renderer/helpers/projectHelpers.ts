import { buildWorkspaceStateFromData } from "../store/state";
import { getFileName } from "../store/tabs";
import type { CreateRepoResult, ProjectRecord, ProjectWorkspaceRecord } from "../api/types";
import type { RepoWorkspaceItem, WorkspaceStoreState } from "../store/types";

type ProjectStoreSlice = Pick<
  WorkspaceStoreState,
  | "projects"
  | "workspaces"
  | "gitChangesCountByWorkspaceId"
  | "gitChangeTotalsByWorkspaceId"
  | "selectedProjectId"
  | "selectedWorkspaceId"
  | "displayProjectIds"
>;

type RepoConfigUpdate = Pick<
  ProjectRecord,
  "name" | "worktreePath" | "privateContextEnabled" | "icon" | "iconBgColor" | "setupScript" | "postScript"
>;

/** Returns persisted repo display ids from local storage when available. */
export function readPersistedDisplayRepoIds(storage: Storage | undefined): string[] | undefined {
  if (!storage) {
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
      };
    };
    const candidate = parsed.state?.displayProjectIds;
    return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

/** Returns only entries keyed by workspace ids that still exist after snapshot reconciliation. */
function filterWorkspaceScopedRecord<T>(record: Record<string, T>, workspaceIdSet: Set<string>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([workspaceId]) => workspaceIdSet.has(workspaceId)),
  ) as Record<string, T>;
}

/** Maps backend API data into workspace projects and open workspaces. */
function mapApiData(projects: ProjectRecord[], workspacesFromApi: ProjectWorkspaceRecord[]): {
  projects: ProjectRecord[];
  workspaces: RepoWorkspaceItem[];
} {
  const preferredWorkspaceByProjectId = new Map<string, ProjectWorkspaceRecord>();
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
      privateContextEnabled: true,
      defaultBranch: preferredWorkspace?.branch ?? "",
      icon: "folder",
      iconBgColor: "#1E66F5",
      setupScript: "",
      postScript: "",
    } satisfies ProjectRecord;
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
          projectId: workspace.projectId,
          repoId: workspace.projectId,
          name: workspace.branch ?? "workspace",
          title: getFileName(workspace.localPath ?? "") || workspace.branch || "workspace",
          sourceBranch: workspace.branch ?? "main",
          branch: workspace.branch ?? "main",
          summaryId: workspace.id,
          worktreePath: workspace.localPath,
          kind: "managed",
        }) satisfies RepoWorkspaceItem,
    );

  return {
    projects: mappedProjects,
    workspaces: managedWorkspaces,
  };
}

/** Reconciles current state with backend snapshot while preserving compatible UI-only state. */
export function buildHydratedStateFromApiData(
  state: ProjectStoreSlice,
  projects: ProjectRecord[],
  workspacesFromApi: ProjectWorkspaceRecord[],
  displayRepoIds: string[] | undefined,
): Partial<ProjectStoreSlice> {
  const { projects: mappedProjects, workspaces } = mapApiData(projects, workspacesFromApi);
  const nextBaseState = buildWorkspaceStateFromData({
    projects: mappedProjects,
    workspaces,
    preferredProjectId: state.selectedProjectId,
    preferredWorkspaceId: state.selectedWorkspaceId,
  });
  const nextProjectIdSet = new Set(mappedProjects.map((project) => project.id));
  const baseDisplayProjectIds = displayRepoIds ?? state.displayProjectIds;
  const filteredDisplayProjectIds = baseDisplayProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
  const shouldResetPersistedDisplayProjectIds =
    displayRepoIds !== undefined &&
    displayRepoIds.length > 0 &&
    filteredDisplayProjectIds.length === 0 &&
    mappedProjects.length > 0;
  const nextDisplayProjectIds =
    displayRepoIds === undefined && baseDisplayProjectIds.length === 0
      ? mappedProjects.map((project) => project.id)
      : shouldResetPersistedDisplayProjectIds
        ? mappedProjects.map((project) => project.id)
        : filteredDisplayProjectIds;
  const nextWorkspaceIdSet = new Set(workspaces.map((workspace) => workspace.id));

  return {
    ...nextBaseState,
    displayProjectIds: nextDisplayProjectIds,
    gitChangesCountByWorkspaceId: filterWorkspaceScopedRecord(state.gitChangesCountByWorkspaceId, nextWorkspaceIdSet),
    gitChangeTotalsByWorkspaceId: filterWorkspaceScopedRecord(state.gitChangeTotalsByWorkspaceId, nextWorkspaceIdSet),
  };
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

/** Builds optimistic local state for a newly created repo. */
export function buildCreatedRepoState(
  state: ProjectStoreSlice,
  input: {
    name: string;
    source: "local" | "remote";
    normalizedPath: string;
    normalizedGitUrl: string;
    resolvedPath: string;
    backendRepo: CreateRepoResult;
  },
): Partial<ProjectStoreSlice> {
  const currentProjects = state.projects;
  const currentDisplayProjectIds = state.displayProjectIds;
  const nextRepoId = input.backendRepo.id;
  const repoPath = (input.backendRepo.localPath ?? input.resolvedPath).trim();
  const nextProject = {
    id: nextRepoId,
    key: input.backendRepo.key ?? nextRepoId,
    name: input.name.trim(),
    path: repoPath,
    missing: false,
    gitUrl: input.backendRepo.gitUrl ?? (input.source === "remote" ? input.normalizedGitUrl : ""),
    localPath: input.source === "local" ? repoPath : "",
    worktreePath: input.backendRepo.worktreePath ?? (input.source === "local" ? repoPath : ""),
    privateContextEnabled: input.backendRepo.privateContextEnabled ?? true,
    defaultBranch: input.backendRepo.defaultBranch ?? "",
    icon: "folder",
    iconBgColor: "#1E66F5",
    setupScript: input.backendRepo.setupScript ?? "",
    postScript: input.backendRepo.postScript ?? "",
    sourceType: input.source === "local" ? "git-local" : "git",
    repoProvider: null,
    repoUrl: input.backendRepo.gitUrl ?? (input.source === "remote" ? input.normalizedGitUrl : "") || null,
    repoKey: input.backendRepo.key ?? nextRepoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdByUserId: "",
  } satisfies ProjectRecord;
  return {
    projects: [...currentProjects, nextProject],
    workspaces: state.workspaces,
    displayProjectIds:
      currentDisplayProjectIds.length === currentProjects.length
        ? [...currentDisplayProjectIds, nextRepoId]
        : currentDisplayProjectIds,
    selectedProjectId: nextRepoId,
    selectedWorkspaceId: "",
  };
}

/** Removes a repo and all workspace-scoped UI state derived from that repo. */
export function buildDeletedRepoState(state: ProjectStoreSlice, repoId: string): Partial<ProjectStoreSlice> {
  const currentDisplayProjectIds = state.displayProjectIds;
  const nextProjects = state.projects.filter((project) => project.id !== repoId);
  const deletedWorkspaceIdSet = new Set(
    state.workspaces
      .filter((workspace) => (workspace.projectId ?? workspace.repoId) === repoId)
      .map((workspace) => workspace.id),
  );
  const nextWorkspaces = state.workspaces.filter((workspace) => (workspace.projectId ?? workspace.repoId) !== repoId);
  const nextGitChangesCountByWorkspaceId = { ...state.gitChangesCountByWorkspaceId };
  const nextGitChangeTotalsByWorkspaceId = { ...state.gitChangeTotalsByWorkspaceId };
  for (const workspaceId of deletedWorkspaceIdSet) {
    delete nextGitChangesCountByWorkspaceId[workspaceId];
    delete nextGitChangeTotalsByWorkspaceId[workspaceId];
  }

  const nextSelectedProjectId =
    state.selectedProjectId === repoId ? (nextProjects[0]?.id ?? "") : state.selectedProjectId;
  const nextSelectedWorkspaceId = nextWorkspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (nextWorkspaces.find((workspace) => (workspace.projectId ?? workspace.repoId) === nextSelectedProjectId)?.id ??
      nextWorkspaces[0]?.id ??
      "");

  return {
    projects: nextProjects,
    workspaces: nextWorkspaces,
    displayProjectIds: currentDisplayProjectIds.filter((id) => id !== repoId),
    selectedProjectId: nextSelectedProjectId,
    selectedWorkspaceId: nextSelectedWorkspaceId,
    gitChangesCountByWorkspaceId: nextGitChangesCountByWorkspaceId,
    gitChangeTotalsByWorkspaceId: nextGitChangeTotalsByWorkspaceId,
  };
}

/** Applies repo config updates to local state after save attempts. */
export function buildUpdatedRepoConfigState(
  state: Pick<WorkspaceStoreState, "projects">,
  repoId: string,
  config: RepoConfigUpdate,
): Pick<WorkspaceStoreState, "projects"> {
  return {
    projects: state.projects.map((project) =>
      project.id === repoId
        ? {
            ...project,
            name: config.name,
            worktreePath: config.worktreePath,
            privateContextEnabled: config.privateContextEnabled,
            icon: config.icon,
            iconBgColor: config.iconBgColor,
            setupScript: config.setupScript,
            postScript: config.postScript,
          }
        : project,
    ),
  };
}
