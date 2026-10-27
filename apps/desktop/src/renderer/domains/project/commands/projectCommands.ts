import { incrementFileTreeRefreshVersion } from "@renderer/domains/files";
import { incrementGitRefreshVersion } from "@renderer/domains/git";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { activateProject } from "@renderer/domains/workbench";
import { resolveTabForWorkspace } from "@renderer/domains/workbench";

import { writeClipboardText } from "@renderer/platform/clipboard";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import type { ProjectWithWorkspacesRecord } from "../api/types";

import { sessionStore } from "@renderer/domains/session";
import {
  applyLocalFolderImport,
  buildWorkspaceOpenProjectEntries,
  getWorkspaceRpc,
  openWorkspaceEntries,
  syncTabStoreWithWorkspace,
  workspaceSettingsStore,
  workspaceStore,
} from "@renderer/domains/workspace";
import type { ExternalAppId } from "@shared/contracts/externalApps";
import {
  createProject as createProjectFromApi,
  deleteProject as deleteProjectFromApi,
  ensureProjectTaskPrefix as ensureProjectTaskPrefixFromApi,
  promoteGitLocalProject as promoteGitLocalProjectFromApi,
  updateProject as updateProjectFromApi,
} from "../api/projectApi";
import { beginProjectMutation } from "../state/projectMutationStore";
import { pickRandomProjectColor, pickRandomProjectIcon, projectStore } from "../state/projectStore";
import { createProjectConfigScope, prepareProjectPathChange, syncProjectPathChange } from "./projectConfigPath";
import { writeProjectFilter } from "./projectFilterCommands";

/** Records the last external application used within one organization. */
export function recordLastUsedExternalApp(organizationId: string, appId: ExternalAppId): void {
  projectStore.getState().setLastUsedExternalAppId(organizationId, appId);
}

/** Creates one project in backend, then applies it into the local legacy store shape. */
export async function createProject(input: {
  name: string;
  taskPrefix: string;
  sourceTypeHint?: "unknown" | "git-local" | "git";
  path?: string;
  gitUrl?: string;
}): Promise<void> {
  const normalizedName = input.name.trim();
  const taskPrefix = input.taskPrefix.trim();
  const normalizedPath = input.path?.trim() || "";
  const normalizedGitUrl = input.gitUrl?.trim() || "";
  const isLocalSource = Boolean(normalizedPath);
  const resolvedPath = normalizedPath || normalizedGitUrl;
  if (!normalizedName || !taskPrefix || !resolvedPath) {
    return;
  }

  let inferredSourceTypeHint: "unknown" | "git-local" | "git" = input.sourceTypeHint ?? "git";
  let inferredRemoteUrl = normalizedGitUrl || undefined;
  let inferredDefaultBranch: string | undefined;
  let inferredNodeId: string | undefined;

  if (isLocalSource) {
    const workspaceRpc = await getWorkspaceRpc();
    const localPathImport = await workspaceRpc.importLocalPath({ path: normalizedPath, name: normalizedName });
    if (localPathImport.kind === "folder") {
      await applyLocalFolderImport(localPathImport.folder);
      return;
    }
    inferredNodeId = sessionStore.getState().daemonId?.trim();
    inferredRemoteUrl = localPathImport.remoteUrl;
    inferredSourceTypeHint = inferredRemoteUrl ? "git" : "git-local";
    inferredDefaultBranch = localPathImport.currentBranch;
  }

  const creationSession = sessionStore.getState();
  const selectedOrganizationId = creationSession.selectedOrganizationId?.trim();
  if (!selectedOrganizationId) {
    return;
  }

  let project: ProjectWithWorkspacesRecord | undefined;
  const randomIcon = pickRandomProjectIcon();
  const randomColor = pickRandomProjectColor();
  let isCurrentCreationScope = true;
  const unsubscribe = sessionStore.subscribe((current) => {
    if (
      current.currentUserId !== creationSession.currentUserId ||
      current.daemonId !== creationSession.daemonId ||
      current.selectedOrganizationId !== creationSession.selectedOrganizationId
    )
      isCurrentCreationScope = false;
  });

  try {
    project = await createProjectFromApi(selectedOrganizationId, {
      name: normalizedName,
      taskPrefix,
      sourceTypeHint: inferredSourceTypeHint,
      repoUrl: inferredRemoteUrl,
      nodeId: inferredNodeId,
      localPath: isLocalSource ? normalizedPath : undefined,
      contextEnabled: workspaceSettingsStore.getState().isDefaultContextEnabled,
      icon: randomIcon,
      color: randomColor,
    });
  } catch (error) {
    console.error("Failed to create backend project", error);
    throw new Error(getErrorMessage(error));
  } finally {
    unsubscribe();
  }

  if (!project) {
    throw new Error("Backend project response is empty");
  }

  const currentSession = sessionStore.getState();
  if (
    !isCurrentCreationScope ||
    currentSession.selectedOrganizationId?.trim() !== selectedOrganizationId ||
    currentSession.currentUserId !== creationSession.currentUserId ||
    currentSession.daemonId !== creationSession.daemonId
  ) {
    return;
  }

  if (
    !(await writeProjectFilter(
      (_, explicitIds) => explicitIds && [...new Set([...explicitIds, project.id])],
      selectedOrganizationId,
    ))
  )
    return;

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
      organizationId: project.organizationId,
      name: project.name || normalizedName,
      key: project.repoKey ?? undefined,
      repoKey: project.repoKey ?? null,
      localPath: resolvedProjectLocalPath,
      worktreePath: resolvedProjectLocalPath,
      gitUrl: project.repoUrl ?? inferredRemoteUrl,
      repoUrl: project.repoUrl ?? inferredRemoteUrl,
      contextEnabled: project.contextEnabled,
      taskPrefix: project.taskPrefix,
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
  // The project store appends the project + display id; the command activates
  // the new project through the Workbench navigation command (active context
  // is Workbench-owned, never project-store-owned).
  activateProject({ projectId: project.id });

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

/** Promotes one git-local project and applies the authoritative response to local state. */
export async function promoteGitLocalProject(projectId: string, remoteUrl: string): Promise<void> {
  const project = projectStore.getState().projects.find((candidate) => candidate.id === projectId);
  const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
  if (project?.sourceType !== "git-local" || !selectedOrganizationId || !remoteUrl.trim()) {
    return;
  }

  try {
    const updatedProject = await promoteGitLocalProjectFromApi(selectedOrganizationId, projectId, remoteUrl.trim());
    if (sessionStore.getState().selectedOrganizationId?.trim() !== selectedOrganizationId) {
      return;
    }
    projectStore.getState().applyProjectRecord(updatedProject);
  } catch (error) {
    console.error("Failed to promote git-local project", { projectId, remoteUrl, error });
    throw new Error(getErrorMessage(error));
  }
}

/** Ensures one project's immutable task prefix and applies it to local state. */
export async function ensureProjectTaskPrefix(projectId: string): Promise<void> {
  const project = projectStore.getState().projects.find((candidate) => candidate.id === projectId);
  const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
  if (!project || !selectedOrganizationId) {
    return;
  }

  try {
    const updatedProject = await ensureProjectTaskPrefixFromApi(selectedOrganizationId, projectId);
    if (!updatedProject.taskPrefix) {
      throw new Error("Backend project response is missing task prefix");
    }
    projectStore.getState().setProjectTaskPrefix(projectId, updatedProject.taskPrefix);
  } catch (error) {
    console.error("Failed to ensure project task prefix", error);
    throw new Error(getErrorMessage(error));
  }
}

/** Copies one project's task prefix to the system clipboard. */
export async function copyProjectTaskPrefix(projectId: string): Promise<void> {
  const project = projectStore.getState().projects.find((candidate) => candidate.id === projectId);
  const taskPrefix = project?.taskPrefix?.trim();
  if (!taskPrefix) {
    return;
  }

  try {
    await writeClipboardText(taskPrefix);
  } catch (error) {
    console.error("Failed to copy project task prefix", error);
    throw new Error(getErrorMessage(error));
  }
}

/** Deletes one project in backend and then removes it from local store state. */
export async function deleteProject(projectId: string): Promise<void> {
  if (!projectId.trim()) throw new Error("A project ID is required to delete a project");
  const scope = createProjectConfigScope();
  const finishMutation = beginProjectMutation();
  try {
    const selectedOrganizationId = scope.organizationId;
    if (!selectedOrganizationId) throw new Error("An organization is required to delete a project");
    await deleteProjectFromApi(selectedOrganizationId, projectId);
    if (!scope.isCurrent()) return;

    const previousWorkspaces = workspaceStore.getState().workspaces;
    for (const workspace of previousWorkspaces) {
      if ((workspace.projectId ?? workspace.repoId) === projectId) {
        workspaceStore.getState().removeWorkspace({ projectId, workspaceId: workspace.id });
      }
    }
    projectStore.getState().deleteProject(projectId);
    const navigation = workbenchNavigationStore.getState();
    if (navigation.activeProjectId === projectId) {
      navigation.setActiveProjectId("");
    }
    if (
      previousWorkspaces.some(
        (workspace) =>
          workspace.id === navigation.activeWorkspaceId && (workspace.projectId ?? workspace.repoId) === projectId,
      )
    ) {
      navigation.setActiveWorkspaceId("");
    }
    await syncTabStoreWithWorkspace(previousWorkspaces);
  } finally {
    scope.dispose();
    finishMutation();
  }
}

/** Persists project config to backend and updates local config state when successful. */
export async function updateProjectConfig(
  projectId: string,
  input: {
    name: string;
    localPath?: string;
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

  const { localPath, ...config } = input;
  const previousContextEnabled = project.contextEnabled ?? true;

  const finishMutation = beginProjectMutation();
  const scope = createProjectConfigScope();
  const selectedOrganizationId = scope.organizationId;
  try {
    const pathChange = await prepareProjectPathChange(project, localPath, selectedOrganizationId);
    if (!scope.isCurrent()) return;
    if (selectedOrganizationId) {
      try {
        const updatedProject = await updateProjectFromApi(selectedOrganizationId, projectId, {
          ...pathChange,
          name: config.name,
          icon: config.icon,
          color: config.color,
          setupScript: config.setupScript,
          postScript: config.postScript,
          commands: config.commands,
          contextEnabled: config.contextEnabled,
        });

        if (!scope.isCurrent()) return;
        if (pathChange) await syncProjectPathChange(projectId, selectedOrganizationId, pathChange, scope.isCurrent);
        if (!scope.isCurrent()) return;

        const persistedConfig = {
          ...(pathChange ? { localPath: pathChange.localPath } : {}),
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
          await syncProjectContextLinks(
            {
              projectId,
              repoKey: updatedProject.repoKey ?? project.repoKey ?? project.key ?? null,
              enabled: updatedProject.contextEnabled,
            },
            scope.isCurrent,
          );
        }
        return;
      } catch (error) {
        console.error("Failed to update backend project", error);
        throw new Error(getErrorMessage(error));
      }
    }

    projectStore.getState().updateProjectConfig(projectId, config);
    incrementFileTreeRefreshVersion();
  } finally {
    scope.dispose();
    finishMutation();
  }
}

/**
 * Asks the local daemon to add or remove the `.my-context` link in every
 * known workspace worktree for the given project. Git projects use the
 * shared per-repo context root via a symlink; non-git projects use a real
 * `.my-context` directory in each worktree (`nonGit: true`, no repoKey).
 * Failures are logged but do not throw so the user-facing project update is
 * still considered successful.
 */
async function syncProjectContextLinks(
  input: {
    projectId: string;
    repoKey: string | null;
    enabled: boolean;
  },
  isCurrentScope: () => boolean = () => true,
): Promise<void> {
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

  for (const workspace of workspaceStore.getState().workspaces) {
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
    if (!isCurrentScope()) return;
    const workspaceRpc = await getWorkspaceRpc();
    if (!isCurrentScope()) return;
    await workspaceRpc.syncContextLink({
      repoKey,
      projectId: input.projectId,
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
