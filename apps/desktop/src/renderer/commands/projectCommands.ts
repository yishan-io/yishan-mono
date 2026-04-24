import { readPersistedDisplayRepoIds } from "../helpers/projectHelpers";
import { createProject as createRemoteProject } from "../api/orgProjectApi";
import { getOrgProjectSnapshot } from "../api/orgProjectQueries";
import { rendererQueryClient } from "../queryClient";
import { getApiServiceClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { workspaceStore } from "../store/workspaceStore";
import type { RepoSnapshot } from "../types/projectTypes";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

async function inspectLocalRepository(path: string): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  try {
    const client = await getApiServiceClient();
    return (await client.git.inspect({ path })) as {
      isGitRepository: boolean;
      remoteUrl?: string;
      currentBranch?: string;
    };
  } catch {
    return {
      isGitRepository: false,
    };
  }
}

/**
 * Maps org/project REST rows into the legacy workspace-store snapshot shape.
 */
function mapOrgProjectSnapshotToStore(
  projectsList: Array<{
    id: string;
    name: string;
    sourceType: "git" | "git-local" | "unknown";
    repoProvider: string | null;
    repoUrl: string | null;
    repoKey: string | null;
  }>,
  workspacesList: Array<{
    id: string;
    projectId: string;
    branch: string | null;
    localPath: string;
  }>,
): RepoSnapshot {
  const projectById = new Map<
    string,
    {
      id: string;
      key: string;
      name?: string;
      localPath: string;
      gitUrl: string;
      worktreePath: string;
      privateContextEnabled: boolean;
      defaultBranch: string;
      icon: string;
      color: string;
      setupScript: string;
      postScript: string;
    }
  >();
  const workspaces: RepoSnapshot["workspaces"] = [];

  for (const project of projectsList) {
    projectById.set(project.id, {
      id: project.id,
      key: project.repoKey ?? project.id,
      name: project.name,
      localPath: "",
      gitUrl: project.repoUrl ?? "",
      worktreePath: "",
      privateContextEnabled: true,
      defaultBranch: "main",
      icon: "folder",
      color: "#1E66F5",
      setupScript: "",
      postScript: "",
    });
  }

  for (const item of workspacesList) {
    const parentId = item.projectId ?? "";
    if (!parentId) {
      continue;
    }

    if (!projectById.has(parentId)) {
      projectById.set(parentId, {
        id: parentId,
        key: parentId,
        localPath: item.localPath ?? "",
        gitUrl: "",
        worktreePath: item.localPath ?? "",
        privateContextEnabled: true,
        defaultBranch: item.branch ?? "main",
        icon: "folder",
        color: "#1E66F5",
        setupScript: "",
        postScript: "",
      });
    }

    workspaces.push({
      workspaceId: item.id,
      repoId: parentId,
      projectId: item.projectId,
      name: item.branch ?? "Workspace",
      sourceBranch: item.branch ?? "main",
      branch: item.branch ?? "main",
      worktreePath: item.localPath ?? "",
      status: "open",
    });
  }

  return {
    repos: [...projectById.values()],
    workspaces,
  };
}

/** Loads backend snapshot data and hydrates the workspace store from it. */
export async function loadWorkspaceFromBackend(): Promise<void> {
  const previousWorkspaces = workspaceStore.getState().workspaces;

  try {
    const snapshotQuery = await rendererQueryClient.fetchQuery({
      queryKey: ["org-project-snapshot"],
      queryFn: getOrgProjectSnapshot,
      staleTime: 30_000,
    });
    if (!snapshotQuery.organizationId) {
      workspaceStore.getState().loadWorkspaceFromBackend({ repos: [], workspaces: [] }, []);
      syncTabStoreWithWorkspace(previousWorkspaces);
      return;
    }

    const snapshot = mapOrgProjectSnapshotToStore(snapshotQuery.projects, snapshotQuery.workspaces);
    const persistedDisplayProjectIds = readPersistedDisplayRepoIds(
      typeof localStorage === "undefined" ? undefined : localStorage,
    );
    workspaceStore.getState().loadWorkspaceFromBackend(snapshot, persistedDisplayProjectIds);
    syncTabStoreWithWorkspace(previousWorkspaces);
  } catch (error) {
    console.error("Failed to load workspace snapshot", error);
  }
}

/** Creates one project in backend, then applies it into the local legacy store shape. */
export async function createProject(input: {
  name: string;
  key?: string;
  source: "local" | "remote";
  path?: string;
  gitUrl?: string;
}): Promise<void> {
  const normalizedName = input.name.trim();
  const normalizedKey = input.key?.trim() || "";
  const normalizedPath = input.path?.trim() || "";
  const normalizedGitUrl = input.gitUrl?.trim() || "";
  const resolvedPath = input.source === "local" ? normalizedPath : normalizedGitUrl || normalizedPath;
  if (!normalizedName || !resolvedPath) {
    return;
  }

  const sessionState = sessionStore.getState();
  const selectedOrganizationId = sessionState.selectedOrganizationId?.trim();
  if (!selectedOrganizationId) {
    return;
  }

  let inferredSourceTypeHint: "unknown" | "git-local" = input.source === "local" ? "git-local" : "unknown";
  let inferredRemoteUrl = input.source === "remote" ? normalizedGitUrl || undefined : undefined;
  let inferredDefaultBranch: string | undefined;

  if (input.source === "local" && normalizedPath) {
    const localRepositoryMetadata = await inspectLocalRepository(normalizedPath);
    inferredSourceTypeHint = localRepositoryMetadata.isGitRepository ? "git-local" : "unknown";
    inferredRemoteUrl = localRepositoryMetadata.remoteUrl || undefined;
    inferredDefaultBranch = localRepositoryMetadata.currentBranch || undefined;
  }

  let backendProject:
    | {
        id: string;
        repoKey: string | null;
        repoUrl: string | null;
      }
    | undefined;

  try {
    backendProject = await createRemoteProject(selectedOrganizationId, {
      name: normalizedName,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      localPath: input.source === "local" ? normalizedPath || undefined : undefined,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
  }

  if (!backendProject?.id) {
    return;
  }

  workspaceStore.getState().createRepo({
    ...input,
    backendRepo: {
      id: backendProject.id,
      key: backendProject.repoKey ?? normalizedKey ?? undefined,
      localPath: input.source === "local" ? normalizedPath || undefined : undefined,
      worktreePath: input.source === "local" ? normalizedPath || undefined : undefined,
      gitUrl: backendProject.repoUrl ?? inferredRemoteUrl,
      contextEnabled: true,
      icon: "folder",
      color: "#1E66F5",
      setupScript: "",
      postScript: "",
      defaultBranch: inferredDefaultBranch ?? null,
    },
  });
}

/** @deprecated use createProject; kept for legacy call sites during migration. */
export const createRepo = createProject;

/** Deletes one project in backend and then removes it from local store state. */
export async function deleteProject(projectId: string): Promise<void> {
  if (!projectId) {
    return;
  }

  const previousWorkspaces = workspaceStore.getState().workspaces;
  const client = await getApiServiceClient();

  try {
    await client.repo.deleteRepo({ repoId: projectId });
  } catch (error) {
    console.error("Failed to delete backend project and workspaces", error);
    return;
  }

  workspaceStore.getState().deleteRepo(projectId);
  syncTabStoreWithWorkspace(previousWorkspaces);
}

/** @deprecated use deleteProject; kept for legacy call sites during migration. */
export const deleteRepo = deleteProject;

/** Persists project config to backend and updates local config state when successful. */
export async function updateProjectConfig(
  projectId: string,
  config: {
    name: string;
    worktreePath: string;
    privateContextEnabled?: boolean;
    icon?: string;
    iconBgColor?: string;
    setupScript?: string;
    postScript?: string;
  },
): Promise<void> {
  const project =
    workspaceStore.getState().projects.find((item) => item.id === projectId) ??
    workspaceStore.getState().repos.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const client = await getApiServiceClient();
  try {
    await client.repo.createRepo({
      key: project.key,
      localPath: project.localPath || undefined,
      remoteUrl: project.gitUrl || undefined,
      worktreePath: config.worktreePath,
      contextEnabled: config.privateContextEnabled,
      icon: config.icon,
      color: config.iconBgColor,
      setupScript: config.setupScript,
      postScript: config.postScript,
    });
  } catch (error) {
    console.error("Failed to persist project config", error);
    return;
  }

  const store = workspaceStore.getState();
  store.updateRepoConfig(projectId, config);
  store.incrementFileTreeRefreshVersion();
}

/** @deprecated use updateProjectConfig; kept for legacy call sites during migration. */
export const updateRepoConfig = updateProjectConfig;
