import { api } from "../../../api";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "../../../api";
import { loadWorkspaceSnapshot as loadWorkspaceSnapshotFlow } from "../../../app/flows/workspaceSnapshotFlow";
import { syncTabStoreWithWorkspace } from "../../../commands/workspaceTabSync";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { ProjectListPreference } from "../../../rpc/daemonTypes";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { sessionStore } from "../../../store/sessionStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { tabStore } from "../../../store/tabStore";
import { LOCAL_FOLDER_PROJECT_ID } from "../../../store/types";
import { workspaceStore } from "../../../store/workspaceStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { createLocalFolderImport } from "../../workspace/commands/localFolderCommands";
import {
  buildWorkspaceOpenProjectEntries,
  openWorkspaceEntries,
} from "../../workspace/commands/workspaceWarmupCommand";
import { workspaceProjectionStore } from "../../workspace/model/workspaceProjectionStore";
import { pickRandomProjectColor, pickRandomProjectIcon } from "../model/projectIconPresets";
import { projectStore } from "../model/projectStore";

/** Loads the latest workspace snapshot (shared Flow owned by Events + Commands). */
export function loadWorkspaceSnapshot(): Promise<void> {
  return loadWorkspaceSnapshotFlow();
}

async function inspectLocalRepository(path: string): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  try {
    const client = await getDaemonClient();
    const result = (await client.git.inspectPath({ path })) as {
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

/** Loads one organization's project-list order/fold preferences from the daemon. */
export async function getProjectListPreferences(organizationId: string) {
  const client = await getDaemonClient();
  return client.project.getListPreferences(organizationId);
}

/** Persists one organization's project-list order/fold preferences to the daemon. */
export async function setProjectListPreferences(
  organizationId: string,
  preferences: ProjectListPreference,
): Promise<void> {
  const client = await getDaemonClient();
  await client.project.setListPreferences(organizationId, preferences);
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

  let inferredSourceTypeHint: "unknown" | "git-local" | "git" =
    input.sourceTypeHint ?? (isLocalSource ? "git-local" : "git");
  let inferredRemoteUrl = normalizedGitUrl || undefined;
  let inferredDefaultBranch: string | undefined;
  let inferredNodeId: string | undefined;
  const localRepositoryMetadata = isLocalSource ? await inspectLocalRepository(normalizedPath) : undefined;

  if (isLocalSource && localRepositoryMetadata) {
    inferredNodeId = sessionStore.getState().daemonId?.trim();
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

  // Non-git local folders live only on the daemon: no backend record or context link.
  if (isLocalSource && inferredSourceTypeHint === "unknown") {
    await createLocalFolderImport({ path: normalizedPath, name: normalizedName });
    return;
  }

  const sessionState = sessionStore.getState();
  const selectedOrganizationId = sessionState.selectedOrganizationId?.trim();
  if (!selectedOrganizationId) {
    return;
  }

  let project: ProjectWithWorkspacesRecord | undefined;
  const randomIcon = pickRandomProjectIcon();
  const randomColor = pickRandomProjectColor();

  try {
    project = await api.project.create(selectedOrganizationId, {
      name: normalizedName,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      nodeId: inferredNodeId,
      localPath: isLocalSource ? normalizedPath : undefined,
      contextEnabled: workspaceSettingsStore.getState().isDefaultContextEnabled,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
    throw new Error(getErrorMessage(error));
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

  projectStore.getState().createProject({
    name: project.name || normalizedName,
    source: isLocalSource ? "local" : "remote",
    path: isLocalSource ? normalizedPath : undefined,
    gitUrl: isLocalSource ? undefined : normalizedGitUrl,
    organizationId: selectedOrganizationId,
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
      icon: randomIcon,
      color: randomColor,
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
  // The project store appends the project + display id; the command selects it
  // (selection is workspace-store-owned, never project-store-owned).
  workspaceStore.getState().setSelectedProjectId(project.id);
  workspaceStore.getState().setSelectedWorkspaceId("");

  for (const workspace of workspaces) {
    const workspaceName = workspace.kind === "primary" ? "local" : workspace.branch?.trim() || "workspace";
    // Non-git projects have no branches: store an empty branch instead of
    // fabricating "main" so nothing downstream mistakes the project for git.
    const isNonGitProject = project.sourceType === "unknown";
    workspaceStore.getState().addWorkspace({
      projectId: workspace.projectId ?? project.id,
      workspaceId: workspace.id,
      name: workspaceName,
      sourceBranch: isNonGitProject ? "" : workspace.branch?.trim() || "main",
      branch: isNonGitProject ? "" : workspace.branch?.trim() || "main",
      worktreePath: workspace.localPath,
      nodeId: workspace.nodeId,
    });
  }

  if (isLocalSource) {
    const importedPrimaryWorkspaceIds = new Set(
      workspaces.filter((workspace) => workspace.kind === "primary").map((workspace) => workspace.id),
    );
    if (importedPrimaryWorkspaceIds.size > 0) {
      const importedPrimaryWorkspaces = workspaceStore
        .getState()
        .workspaces.filter((workspace) => importedPrimaryWorkspaceIds.has(workspace.id));
      const openEntries = buildWorkspaceOpenProjectEntries(importedPrimaryWorkspaces, selectedOrganizationId);
      await openWorkspaceEntries(openEntries);
      for (const entry of openEntries) {
        workspaceUiStore.getState().incrementFileTreeRefreshVersion(entry.worktreePath, []);
        workspaceProjectionStore.getState().incrementGitRefreshVersion(entry.worktreePath);
      }
    }
  }

  tabStore.getState().resolveTabForWorkspace(workspaceStore.getState().selectedWorkspaceId);

  // Ensure the context folder and symlinks are created for the new project's
  // known worktree paths. Without this, the `.my-context` directory is never
  // initialised for the primary workspace that already exists on disk.
  if (project.contextEnabled) {
    await syncProjectContextLinks({
      projectId: project.id,
      repoKey: project.repoKey ?? null,
      enabled: true,
    });
  }
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
      console.error("Failed to delete backend project", error);
      throw new Error(getErrorMessage(error));
    }
  }

  projectStore.getState().deleteProject(projectId);
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
    commands?: Array<{ name: string; command: string }>;
  },
): Promise<void> {
  const project = projectStore.getState().projects.find((item) => item.id === projectId);
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
        commands: config.commands,
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
        commands: updatedProject.commands ?? config.commands,
      };

      const store = workspaceStore.getState();
      projectStore.getState().updateProjectConfig(projectId, persistedConfig);
      store.updateProjectConfig(projectId, persistedConfig);
      workspaceUiStore.getState().incrementFileTreeRefreshVersion();

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
      throw new Error(getErrorMessage(error));
    }
  }

  const store = workspaceStore.getState();
  projectStore.getState().updateProjectConfig(projectId, config);
  store.updateProjectConfig(projectId, config);
  workspaceUiStore.getState().incrementFileTreeRefreshVersion();
}

/**
 * Asks the local daemon to add or remove the `.my-context` link in every
 * known workspace worktree for the given project. Git projects use the
 * shared per-repo context root via a symlink; non-git projects use a real
 * `.my-context` directory in each worktree (`nonGit: true`, no repoKey).
 * Failures are logged but do not throw so the user-facing project update is
 * still considered successful.
 */
async function syncProjectContextLinks(input: {
  projectId: string;
  repoKey: string | null;
  enabled: boolean;
}): Promise<void> {
  const state = workspaceStore.getState();
  const project = projectStore.getState().projects.find((item) => item.id === input.projectId);
  const isNonGit = project?.sourceType === "unknown";
  const repoKey = isNonGit ? "" : (input.repoKey?.trim() ?? "");
  if (!isNonGit && !repoKey) {
    if (import.meta.env.DEV) {
      console.debug("[projectCommands] skip context sync: missing repoKey", input);
    }
    return;
  }
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
      nonGit: isNonGit,
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
