import { incrementFileTreeRefreshVersion } from "@renderer/domains/files";
import { incrementGitRefreshVersion } from "@renderer/domains/git";
import { inspectGitRepositoryPath } from "@renderer/domains/git";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { activateProject } from "@renderer/domains/workbench";
import { resolveTabForWorkspace } from "@renderer/domains/workbench";
import { selectIsDefaultContextEnabled } from "@renderer/domains/workspace";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import type { ProjectWithWorkspacesRecord } from "../../../api/types";
import { selectSelectedOrganizationId, selectSessionDaemonId } from "../../../domains/session";
import {
  addWorkspace as applyAddWorkspace,
  buildWorkspaceOpenProjectEntries,
  createLocalFolderImport,
  openWorkspaceEntries,
  selectWorkspaces,
  syncTabStoreWithWorkspace,
  syncWorkspaceContextLinks,
} from "../../../domains/workspace";
import { type ProjectListPreference, getProjectRpc } from "../infrastructure/daemonProjectClient";
import {
  createProject as createProjectFromApi,
  deleteProject as deleteProjectFromApi,
  updateProject as updateProjectFromApi,
} from "../infrastructure/projectApi";
import { pickRandomProjectColor, pickRandomProjectIcon } from "../services/projectIconSelection";
import { projectStore } from "../state/projectStore";

async function inspectLocalRepository(path: string): Promise<{
  isGitRepository: boolean;
  remoteUrl?: string;
  currentBranch?: string;
}> {
  try {
    const result = await inspectGitRepositoryPath({ path });

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

/** Loads one organization's projects with their workspaces from the daemon. */
export async function listProjectsByOrg(
  organizationId: string,
  opts?: { withWorkspaces?: boolean },
): Promise<ProjectWithWorkspacesRecord[]> {
  const projectRpc = await getProjectRpc();
  return await projectRpc.listByOrg(organizationId, opts);
}

/** Loads one organization's project-list order/fold preferences from the daemon. */
export async function getProjectListPreferences(organizationId: string) {
  const projectRpc = await getProjectRpc();
  return projectRpc.getListPreferences(organizationId);
}

/** Persists one organization's project-list order/fold preferences to the daemon. */
export async function setProjectListPreferences(
  organizationId: string,
  preferences: ProjectListPreference,
): Promise<void> {
  const projectRpc = await getProjectRpc();
  await projectRpc.setListPreferences(organizationId, preferences);
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
    inferredNodeId = selectSessionDaemonId()?.trim();
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

  const selectedOrganizationId = selectSelectedOrganizationId()?.trim();
  if (!selectedOrganizationId) {
    return;
  }

  let project: ProjectWithWorkspacesRecord | undefined;
  const randomIcon = pickRandomProjectIcon();
  const randomColor = pickRandomProjectColor();

  try {
    project = await createProjectFromApi(selectedOrganizationId, {
      name: normalizedName,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      nodeId: inferredNodeId,
      localPath: isLocalSource ? normalizedPath : undefined,
      contextEnabled: selectIsDefaultContextEnabled(),
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
  // The project store appends the project + display id; the command activates
  // the new project through the Workbench navigation command (active context
  // is Workbench-owned, never project-store-owned).
  activateProject({ projectId: project.id });

  for (const workspace of workspaces) {
    const workspaceName = workspace.kind === "primary" ? "local" : workspace.branch?.trim() || "workspace";
    // Non-git projects have no branches: store an empty branch instead of
    // fabricating "main" so nothing downstream mistakes the project for git.
    const isNonGitProject = project.sourceType === "unknown";
    applyAddWorkspace({
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
      const importedPrimaryWorkspaces = selectWorkspaces().filter((workspace) =>
        importedPrimaryWorkspaceIds.has(workspace.id),
      );
      const openEntries = buildWorkspaceOpenProjectEntries(importedPrimaryWorkspaces, selectedOrganizationId);
      await openWorkspaceEntries(openEntries);
      for (const entry of openEntries) {
        incrementFileTreeRefreshVersion(entry.worktreePath, []);
        incrementGitRefreshVersion(entry.worktreePath);
      }
    }
  }

  resolveTabForWorkspace(workbenchNavigationStore.getState().activeWorkspaceId);

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

  const previousWorkspaces = selectWorkspaces();
  const selectedOrganizationId = selectSelectedOrganizationId()?.trim();
  if (selectedOrganizationId) {
    try {
      await deleteProjectFromApi(selectedOrganizationId, projectId);
    } catch (error) {
      console.error("Failed to delete backend project", error);
      throw new Error(getErrorMessage(error));
    }
  }

  projectStore.getState().deleteProject(projectId);
  await syncTabStoreWithWorkspace(previousWorkspaces);
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

  const selectedOrganizationId = selectSelectedOrganizationId()?.trim();
  if (selectedOrganizationId) {
    try {
      const updatedProject = await updateProjectFromApi(selectedOrganizationId, projectId, {
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

      projectStore.getState().updateProjectConfig(projectId, persistedConfig);
      incrementFileTreeRefreshVersion();

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

  projectStore.getState().updateProjectConfig(projectId, config);
  incrementFileTreeRefreshVersion();
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

  for (const workspace of selectWorkspaces()) {
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
    await syncWorkspaceContextLinks({
      repoKey,
      nonGit: isNonGit,
      enabled: input.enabled,
      worktreePaths: Array.from(candidatePaths),
    });
    if (import.meta.env.DEV) {
      console.debug("[projectCommands] context sync ok", { input });
    }
  } catch (error) {
    console.error("Failed to sync project context links across workspaces", error);
  }
}
