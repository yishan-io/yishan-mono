import { inspectGitRepositoryPath } from "@renderer/domains/git";
import { sessionStore } from "@renderer/domains/session";
import { getWorkspaceRpc, workspaceStore } from "@renderer/domains/workspace";
import type { WorkspaceProjectRecord } from "../projectTypes";

type ProjectPathChange = { localPath: string; workspaceId: string; nodeId: string };

/** Tracks the entire save scope, permanently invalidating even an away-and-back change. */
export function createProjectConfigScope() {
  const capturedSession = sessionStore.getState();
  let isCurrent = true;
  const unsubscribe = sessionStore.subscribe((current) => {
    if (
      current.currentUserId !== capturedSession.currentUserId ||
      current.selectedOrganizationId !== capturedSession.selectedOrganizationId ||
      current.daemonId !== capturedSession.daemonId
    )
      isCurrent = false;
  });
  return {
    organizationId: capturedSession.selectedOrganizationId?.trim(),
    isCurrent: () => isCurrent,
    dispose: unsubscribe,
  };
}

/** Validates a changed primary path without importing or creating filesystem rows. */
export async function prepareProjectPathChange(
  project: WorkspaceProjectRecord,
  localPath: string | undefined,
  organizationId: string | undefined,
): Promise<ProjectPathChange | undefined> {
  if (localPath === undefined) return undefined;
  const targetPath = localPath.trim();
  const nodeId = sessionStore.getState().daemonId?.trim();
  const primary = workspaceStore
    .getState()
    .workspaces.find(
      (workspace) =>
        (workspace.projectId ?? workspace.repoId) === project.id &&
        workspace.kind === "local" &&
        workspace.nodeId === nodeId,
    );
  const currentPath = (project.localPath ?? project.path ?? primary?.worktreePath ?? "").trim();
  if (targetPath === currentPath && (!primary || primary.worktreePath?.trim() === targetPath)) return undefined;
  if (!targetPath) throw new Error("Project local path must not be empty");
  if (!organizationId) throw new Error("An organization is required to update the project path");
  if (!primary?.id) throw new Error("The local primary workspace must be hydrated before updating its path");
  if (!nodeId || primary.nodeId !== nodeId) {
    throw new Error("The primary workspace must belong to the current daemon host");
  }
  const inspection = await inspectGitRepositoryPath({ path: targetPath });
  if (!inspection.isGitRepository) throw new Error("The project path must be a Git repository");
  const repositoryRoot = inspection.repositoryRoot;
  if (!repositoryRoot?.trim()) {
    throw new Error("The canonical checkout root is unavailable; update the daemon before changing the project path");
  }
  return { localPath: repositoryRoot, workspaceId: primary.id, nodeId };
}

/** Reconciles the saved backend path, rejecting transport and per-entry daemon failures. */
export async function syncProjectPathChange(
  projectId: string,
  organizationId: string,
  change: ProjectPathChange,
  isCurrentScope: () => boolean,
): Promise<void> {
  if (!isCurrentScope()) return;
  const workspaceRpc = await getWorkspaceRpc();
  if (!isCurrentScope()) return;
  const opened = await workspaceRpc.openProject({
    workspaces: [
      {
        workspaceId: change.workspaceId,
        worktreePath: change.localPath,
        projectId,
        orgId: organizationId,
        kind: "primary",
      },
    ],
  });
  if (!isCurrentScope()) return;
  if (opened.errors?.length) {
    throw new Error(`Project path saved, but daemon sync failed: ${opened.errors.join("; ")}`);
  }
  if (!opened.opened?.includes(change.workspaceId) && !opened.skipped?.includes(change.workspaceId)) {
    throw new Error("Project path saved, but daemon did not confirm the primary workspace; retry saving");
  }
  workspaceStore.getState().applyPrimaryWorkspacePath({
    workspaceId: change.workspaceId,
    worktreePath: change.localPath,
  });
}
