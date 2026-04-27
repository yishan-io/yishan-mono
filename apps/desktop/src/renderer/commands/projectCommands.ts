import { readPersistedWorkspacePreferencesByOrg } from "../helpers/projectHelpers";
import {
  api,
} from "../api";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "../api";
import { RestApiError } from "../api/restClient";
import { getDaemonClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

async function inspectLocalRepository(path: string): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  try {
    const client = await getDaemonClient();
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
      workspaceStore.getState().load("", [], []);
      syncTabStoreWithWorkspace(previousWorkspaces);
      return;
    }

    const projectsWithWorkspaces: ProjectWithWorkspacesRecord[] = await api.project.listByOrg(selectedOrganization.id, {
      withWorkspaces: true,
    });
    const projects: ProjectRecord[] = projectsWithWorkspaces.map(({ workspaces: _, ...project }) => project);
    const workspaces = projectsWithWorkspaces.flatMap((project) => project.workspaces ?? []);

    const persistedWorkspacePreferences = readPersistedWorkspacePreferencesByOrg(
      typeof localStorage === "undefined" ? undefined : localStorage,
      selectedOrganization.id,
    );
    if (persistedWorkspacePreferences) {
      workspaceStore.setState((state) => ({
        organizationPreferencesById: {
          ...(state.organizationPreferencesById ?? {}),
          [selectedOrganization.id]: {
            ...(state.organizationPreferencesById?.[selectedOrganization.id] ?? {}),
            ...persistedWorkspacePreferences,
          },
        },
      }));
    }

    workspaceStore.getState().load(selectedOrganization.id, projects, workspaces);
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

  let project: ProjectWithWorkspacesRecord | undefined;

  try {
    project = await api.project.create(selectedOrganizationId, {
      name: normalizedName,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      nodeId: inferredNodeId,
      localPath: input.source === "local" ? normalizedPath || undefined : undefined,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
    throw error instanceof Error ? error : new Error("Failed to create backend project");
  }

  if (!project) {
    throw new Error("Backend project response is empty");
  }

  const workspaces = project.workspaces ?? [];
  const primaryWorkspace =
    workspaces.find((workspace) => workspace.kind === "primary") ?? workspaces[0];
  const resolvedProjectLocalPath =
    input.source === "local"
      ? normalizedPath || undefined
      : (primaryWorkspace?.localPath?.trim() || undefined);
  const resolvedProjectDefaultBranch = primaryWorkspace?.branch ?? inferredDefaultBranch ?? null;

  workspaceStore.getState().createProject({
    ...input,
    name: project.name || normalizedName,
    backendProject: {
      id: project.id,
      name: project.name || normalizedName,
      key: project.repoKey ?? normalizedKey ?? undefined,
      repoKey: project.repoKey ?? normalizedKey ?? null,
      localPath: resolvedProjectLocalPath,
      worktreePath: resolvedProjectLocalPath,
      gitUrl: project.repoUrl ?? inferredRemoteUrl,
      repoUrl: project.repoUrl ?? inferredRemoteUrl,
      contextEnabled: project.contextEnabled,
      icon: project.icon,
      color: project.color,
      setupScript: project.setupScript,
      postScript: project.postScript,
      defaultBranch: resolvedProjectDefaultBranch,
      sourceType: project.sourceType,
      repoProvider: project.repoProvider,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      createdByUserId: project.createdByUserId,
    },
  });

  for (const workspace of workspaces) {
    workspaceStore.getState().addWorkspace({
      projectId: workspace.projectId ?? project.id,
      workspaceId: workspace.id,
      name: workspace.branch?.trim() || "workspace",
      sourceBranch: workspace.branch?.trim() || "main",
      branch: workspace.branch?.trim() || "main",
      worktreePath: workspace.localPath,
    });
  }

  tabStore.getState().setSelectedWorkspaceId(workspaceStore.getState().selectedWorkspaceId);
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
    worktreePath?: string;
    contextEnabled?: boolean;
    icon?: string;
    color?: string;
    setupScript?: string;
    postScript?: string;
  },
): Promise<void> {
  const project =
    workspaceStore.getState().projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
  if (selectedOrganizationId) {
    try {
      const updatedProject = await api.project.update(selectedOrganizationId, projectId, {
        name: config.name,
        icon: config.icon,
        color: config.color,
        setupScript: config.setupScript,
        postScript: config.postScript,
        contextEnabled: config.contextEnabled,
      });

      const persistedConfig = {
        ...config,
        name: updatedProject.name,
        contextEnabled: updatedProject.contextEnabled,
        icon: updatedProject.icon,
        color: updatedProject.color,
        setupScript: updatedProject.setupScript,
        postScript: updatedProject.postScript,
      };

      const store = workspaceStore.getState();
      store.updateProjectConfig(projectId, persistedConfig);
      store.incrementFileTreeRefreshVersion();
      return;
    } catch (error) {
      console.error("Failed to update backend project", error);
      return;
    }
  }

  const store = workspaceStore.getState();
  store.updateProjectConfig(projectId, config);
  store.incrementFileTreeRefreshVersion();
}
