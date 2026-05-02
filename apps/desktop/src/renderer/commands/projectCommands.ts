import { api } from "../api";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "../api";
import { RestApiError } from "../api/restClient";
import { readPersistedWorkspacePreferencesByOrg } from "../helpers/projectHelpers";
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

/** Infers whether one local folder is non-git, git-local, or git with a remote. */
export async function inspectLocalProjectSource(path: string): Promise<{
  sourceTypeHint: "unknown" | "git-local" | "git";
  remoteUrl?: string;
}> {
  const metadata = await inspectLocalRepository(path);
  const remoteUrl = metadata.remoteUrl?.trim() || undefined;

  return {
    sourceTypeHint: remoteUrl ? "git" : metadata.isGitRepository ? "git-local" : "unknown",
    remoteUrl,
  };
}

/** Loads backend snapshot data and hydrates the workspace store from it. */
export async function loadWorkspaceFromBackend(): Promise<void> {
  const previousWorkspaces = workspaceStore.getState().workspaces;

  try {
    const sessionState = sessionStore.getState();
    const organizations = sessionState.organizations.length > 0 ? sessionState.organizations : await api.org.list();
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
  sourceTypeHint?: "unknown" | "git-local" | "git";
  path?: string;
  gitUrl?: string;
}): Promise<void> {
  const normalizedName = input.name.trim();
  const normalizedPath = input.path?.trim() || "";
  const normalizedGitUrl = input.gitUrl?.trim() || "";
  const isLocalSource = Boolean(normalizedPath);
  const resolvedPath = normalizedPath || normalizedGitUrl;
  if (!normalizedName || !resolvedPath) {
    return;
  }

  const sessionState = sessionStore.getState();
  const selectedOrganizationId = sessionState.selectedOrganizationId?.trim();
  if (!selectedOrganizationId) {
    return;
  }

  let inferredSourceTypeHint: "unknown" | "git-local" | "git" =
    input.sourceTypeHint ?? (isLocalSource ? "git-local" : "git");
  let inferredRemoteUrl = normalizedGitUrl || undefined;
  let inferredDefaultBranch: string | undefined;
  let inferredNodeId: string | undefined;

  if (isLocalSource) {
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
    inferredRemoteUrl = localRepositoryMetadata.remoteUrl || undefined;
    inferredSourceTypeHint = inferredRemoteUrl
      ? "git"
      : localRepositoryMetadata.isGitRepository
        ? "git-local"
        : "unknown";
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
      localPath: isLocalSource ? normalizedPath || undefined : undefined,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
    throw error instanceof Error ? error : new Error("Failed to create backend project");
  }

  if (!project) {
    throw new Error("Backend project response is empty");
  }

  const workspaces = project.workspaces ?? [];
  const primaryWorkspace = workspaces.find((workspace) => workspace.kind === "primary") ?? workspaces[0];
  const resolvedProjectLocalPath = isLocalSource
    ? normalizedPath || undefined
    : primaryWorkspace?.localPath?.trim() || undefined;
  const resolvedProjectDefaultBranch = primaryWorkspace?.branch ?? inferredDefaultBranch ?? null;

  workspaceStore.getState().createProject({
    name: project.name || normalizedName,
    source: isLocalSource ? "local" : "remote",
    path: isLocalSource ? normalizedPath : undefined,
    gitUrl: isLocalSource ? undefined : normalizedGitUrl,
    backendProject: {
      id: project.id,
      name: project.name || normalizedName,
      key: project.repoKey ?? undefined,
      repoKey: project.repoKey ?? null,
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
    const workspaceName = workspace.kind === "primary" ? "local" : workspace.branch?.trim() || "workspace";
    workspaceStore.getState().addWorkspace({
      projectId: workspace.projectId ?? project.id,
      workspaceId: workspace.id,
      name: workspaceName,
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
        throw error instanceof Error ? error : new Error("Failed to delete backend project and workspaces");
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
  const project = workspaceStore.getState().projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const previousContextEnabled = project.contextEnabled ?? true;

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

      if (config.contextEnabled !== undefined && updatedProject.contextEnabled !== previousContextEnabled) {
        await syncProjectContextLinks({
          projectId,
          repoKey: updatedProject.repoKey ?? project.repoKey ?? project.key ?? null,
          enabled: updatedProject.contextEnabled,
        });
      }
      return;
    } catch (error) {
      console.error("Failed to update backend project", error);
      throw error instanceof Error ? error : new Error("Failed to update backend project");
    }
  }

  const store = workspaceStore.getState();
  store.updateProjectConfig(projectId, config);
  store.incrementFileTreeRefreshVersion();
}

/**
 * Asks the local daemon to add or remove the `.my-context` symlink in every
 * known workspace worktree for the given project. Failures are logged but do
 * not throw so the user-facing project update is still considered successful.
 */
async function syncProjectContextLinks(input: {
  projectId: string;
  repoKey: string | null;
  enabled: boolean;
}): Promise<void> {
  const repoKey = input.repoKey?.trim();
  if (!repoKey) {
    if (import.meta.env.DEV) {
      console.debug("[projectCommands] skip context sync: missing repoKey", input);
    }
    return;
  }

  const state = workspaceStore.getState();
  const project = state.projects.find((item) => item.id === input.projectId);
  const candidatePaths = new Set<string>();

  for (const workspace of state.workspaces) {
    const ownsProject = (workspace.projectId ?? workspace.repoId) === input.projectId;
    if (!ownsProject) {
      continue;
    }
    const path = workspace.worktreePath?.trim();
    if (path) {
      candidatePaths.add(path);
    }
  }

  // Primary repos may surface only via the project record (no workspace entry yet).
  for (const path of [project?.localPath, project?.path, project?.worktreePath]) {
    const trimmed = path?.trim();
    if (trimmed) {
      candidatePaths.add(trimmed);
    }
  }

  if (candidatePaths.size === 0) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const result = await client.workspace.syncContextLink({
      repoKey,
      enabled: input.enabled,
      worktreePaths: Array.from(candidatePaths),
    });
    if (import.meta.env.DEV) {
      console.debug("[projectCommands] context sync result", { input, result });
    }
  } catch (error) {
    console.error("Failed to sync project context links across workspaces", error);
  }
}
