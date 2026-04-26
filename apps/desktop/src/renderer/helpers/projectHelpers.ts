import { buildWorkspaceStateFromData } from "../store/state";
import { getFileName } from "../store/tabs";
import type { ProjectRecord, WorkspaceRecord } from "../api/types";
import type {
  RepoWorkspaceItem,
  WorkspaceProjectRecord,
  WorkspaceStoreOrganizationPreference,
  WorkspaceStoreState,
} from "../store/types";

type ProjectStoreSlice = Pick<
  WorkspaceStoreState,
  | "projects"
  | "workspaces"
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
  "name" | "worktreePath" | "contextEnabled" | "privateContextEnabled" | "icon" | "iconBgColor" | "setupScript" | "postScript"
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
      selectedProjectId: typeof parsed.state?.selectedProjectId === "string" ? parsed.state.selectedProjectId : undefined,
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
  return Object.fromEntries(
    Object.entries(record).filter(([workspaceId]) => workspaceIdSet.has(workspaceId)),
  ) as Record<string, T>;
}

/** Maps backend API data into workspace projects and open workspaces. */
function mapApiData(projects: ProjectRecord[], workspacesFromApi: WorkspaceRecord[]): {
  projects: WorkspaceProjectRecord[];
  workspaces: RepoWorkspaceItem[];
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
      privateContextEnabled: repo.contextEnabled,
      defaultBranch: preferredWorkspace?.branch ?? "",
      icon: repo.icon,
      iconBgColor: repo.color,
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
  organizationId: string,
  projects: ProjectRecord[],
  workspacesFromApi: WorkspaceRecord[],
): Partial<ProjectStoreSlice> {
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
  const baseDisplayProjectIds = orgPreferences?.displayProjectIds ?? [];
  const filteredDisplayProjectIds = baseDisplayProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
  const shouldResetPersistedDisplayProjectIds =
    orgPreferences?.displayProjectIds !== undefined &&
    orgPreferences.displayProjectIds.length > 0 &&
    filteredDisplayProjectIds.length === 0 &&
    mappedProjects.length > 0;
  const nextDisplayProjectIds =
    orgPreferences?.displayProjectIds === undefined && baseDisplayProjectIds.length === 0
      ? mappedProjects.map((project) => project.id)
      : shouldResetPersistedDisplayProjectIds
        ? mappedProjects.map((project) => project.id)
        : filteredDisplayProjectIds;
  const nextLastUsedExternalAppId = orgPreferences?.lastUsedExternalAppId;
  const nextWorkspaceIdSet = new Set(workspaces.map((workspace) => workspace.id));
  const nextOrganizationPreferencesById =
    normalizedOrganizationId.length === 0
      ? state.organizationPreferencesById
      : {
          ...(state.organizationPreferencesById ?? {}),
          [normalizedOrganizationId]: {
            selectedProjectId: nextBaseState.selectedProjectId,
            selectedWorkspaceId: nextBaseState.selectedWorkspaceId,
            displayProjectIds: nextDisplayProjectIds,
            lastUsedExternalAppId: nextLastUsedExternalAppId,
          },
        };

  return {
    ...nextBaseState,
    displayProjectIds: nextDisplayProjectIds,
    lastUsedExternalAppId: nextLastUsedExternalAppId,
    organizationPreferencesById: nextOrganizationPreferencesById,
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
    backendProject: WorkspaceProjectRecord;
  },
): Partial<ProjectStoreSlice> {
  const currentProjects = state.projects;
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
    privateContextEnabled: input.backendProject.contextEnabled ?? true,
    defaultBranch: input.backendProject.defaultBranch ?? "",
    icon: input.backendProject.icon ?? "folder",
    iconBgColor: input.backendProject.iconBgColor ?? "#1E66F5",
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
            contextEnabled: config.contextEnabled ?? config.privateContextEnabled ?? project.contextEnabled,
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
