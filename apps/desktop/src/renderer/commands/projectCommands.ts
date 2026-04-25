import { readPersistedDisplayRepoIds } from "../helpers/projectHelpers";
import {
  api,
} from "../api";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "../api";
import { RestApiError } from "../api/restClient";
import { getDaemonRpcClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { workspaceStore } from "../store/workspaceStore";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

async function inspectLocalRepository(path: string): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  try {
    const client = await getDaemonRpcClient();
    const result = (await client.git.inspect({ path })) as {
      isGitRepository: boolean;
      remoteUrl?: string;
      currentBranch?: string;
    };

    if (import.meta.env.DEV) {
      console.debug("[projectCommands] git.inspect result", { path, result });
    }

    return result;
  } catch {
    if (import.meta.env.DEV) {
      console.debug("[projectCommands] git.inspect failed, falling back", { path });
    }

    return {
      isGitRepository: false,
    };
  }
}

/** Loads backend snapshot data and hydrates the workspace store from it. */
export async function loadWorkspaceFromBackend(): Promise<void> {
  const previousWorkspaces = workspaceStore.getState().workspaces;

  try {
    const sessionState = sessionStore.getState();
    const organizations =
      sessionState.organizations.length > 0 ? sessionState.organizations : await api.org.list();
    const selectedOrganization =
      sessionState.selectedOrganizationId &&
      organizations.some((organization) => organization.id === sessionState.selectedOrganizationId)
        ? organizations.find((organization) => organization.id === sessionState.selectedOrganizationId)
        : organizations[0];

    if (!selectedOrganization) {
      workspaceStore.getState().load([], [], []);
      syncTabStoreWithWorkspace(previousWorkspaces);
      return;
    }

    const projectsWithWorkspaces: ProjectWithWorkspacesRecord[] = await api.project.listByOrg(selectedOrganization.id, {
      withWorkspaces: true,
    });
    const projects: ProjectRecord[] = projectsWithWorkspaces.map(({ workspaces: _, ...project }) => project);
    const workspaces = projectsWithWorkspaces.flatMap((project) => project.workspaces ?? []);

    const persistedDisplayProjectIds = readPersistedDisplayRepoIds(
      typeof localStorage === "undefined" ? undefined : localStorage,
    );
    workspaceStore.getState().load(projects, workspaces, persistedDisplayProjectIds);
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
  let inferredNodeId: string | undefined;

  if (input.source === "local" && normalizedPath) {
    const daemonId = sessionStore.getState().daemonId?.trim();

    try {
      const nodes = await api.node.listByOrg(selectedOrganizationId);
      if (daemonId) {
        const daemonNode = nodes.find((node) => node.id === daemonId && node.scope === "private" && node.canUse);
        inferredNodeId = daemonNode?.id;
      }

      if (!inferredNodeId) {
        const preferredPrivateNode = nodes.find((node) => node.scope === "private" && node.canUse);
        inferredNodeId = preferredPrivateNode?.id;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug("[projectCommands] listOrganizationNodes failed", { error });
      }
    }

    const localRepositoryMetadata = await inspectLocalRepository(normalizedPath);
    inferredSourceTypeHint = localRepositoryMetadata.isGitRepository ? "git-local" : "unknown";
    inferredRemoteUrl = localRepositoryMetadata.remoteUrl || undefined;
    inferredDefaultBranch = localRepositoryMetadata.currentBranch || undefined;

    if (import.meta.env.DEV) {
      console.debug("[projectCommands] local project inference", {
        path: normalizedPath,
        inferredSourceTypeHint,
        inferredRemoteUrl,
        inferredDefaultBranch,
        inferredNodeId,
      });
    }
  }

  let backendProject: ProjectRecord | undefined;

  try {
    backendProject = await api.project.create(selectedOrganizationId, {
      name: normalizedName,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      nodeId: inferredNodeId,
      localPath: input.source === "local" ? normalizedPath || undefined : undefined,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
  }

  if (!backendProject) {
    return;
  }

  workspaceStore.getState().createProject({
    ...input,
    name: backendProject.name || normalizedName,
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

/** Deletes one project in backend and then removes it from local store state. */
export async function deleteProject(projectId: string): Promise<void> {
  if (!projectId) {
    return;
  }

  const previousWorkspaces = workspaceStore.getState().workspaces;
  const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
  if (selectedOrganizationId) {
    try {
      await api.project.delete(selectedOrganizationId, projectId);
    } catch (error) {
      if (!(error instanceof RestApiError && error.status === 404)) {
        console.error("Failed to delete backend project and workspaces", error);
        return;
      }
    }
  }

  workspaceStore.getState().deleteProject(projectId);
  syncTabStoreWithWorkspace(previousWorkspaces);
}

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
    workspaceStore.getState().projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const store = workspaceStore.getState();
  store.updateProjectConfig(projectId, config);
  store.incrementFileTreeRefreshVersion();
}
