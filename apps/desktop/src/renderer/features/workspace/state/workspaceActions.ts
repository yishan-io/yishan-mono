import { workspaceProjectionStore } from "./workspaceProjectionStore";
import { workspaceStore } from "./workspaceStore";
import type { WorkspaceStoreState } from "./workspaceStoreTypes";
import { workspaceUiStore } from "./workspaceUiStore";

/**
 * Workspace feature state actions — the public state-change surface for
 * Workspace State (Phase 12, desktop5.md). Cross-feature commands apply
 * workspace state changes through these functions instead of importing the
 * Workspace Store directly.
 */
export function incrementGitRefreshVersion(workspaceWorktreePath: string): void {
  workspaceProjectionStore.getState().incrementGitRefreshVersion(workspaceWorktreePath);
}

type AddWorkspaceInput = Parameters<WorkspaceStoreState["addWorkspace"]>[0];
type UpdateProjectConfigInput = Parameters<WorkspaceStoreState["updateProjectConfig"]>[1];

/** Adds one workspace record. */
export function addWorkspace(input: AddWorkspaceInput): void {
  workspaceStore.getState().addWorkspace(input);
}

/** Deletes one project (and its workspaces) from workspace state. */
export function deleteProject(projectId: string): void {
  workspaceStore.getState().deleteProject(projectId);
}

/** Updates one project config in workspace state. */
export function updateProjectConfig(projectId: string, config: UpdateProjectConfigInput): void {
  workspaceStore.getState().updateProjectConfig(projectId, config);
}

/** Selects one entry path in the file tree. */
export function setSelectedEntryPath(path: string): void {
  workspaceUiStore.getState().setSelectedEntryPath(path);
}

/** Sets the expanded file-tree items for one workspace. */
export function setExpandedFileTreeItems(workspaceId: string, paths: string[]): void {
  workspaceUiStore.getState().setExpandedFileTreeItems(workspaceId, paths);
}

/** Stores one workspace pull request in the projection store. */
export function setWorkspacePullRequest(
  workspaceId: string,
  pullRequest: Parameters<ReturnType<typeof workspaceProjectionStore.getState>["setWorkspacePullRequest"]>[1],
): void {
  workspaceProjectionStore.getState().setWorkspacePullRequest(workspaceId, pullRequest);
}

/** Reorders the workspace display ids. */
export function setOrderedWorkspaceIds(workspaceIds: string[]): void {
  workspaceStore.getState().setOrderedWorkspaceIds(workspaceIds);
}

/** Bumps the file-tree refresh version for one workspace. */
export function incrementFileTreeRefreshVersion(workspaceWorktreePath?: string, changedRelativePaths?: string[]): void {
  workspaceUiStore.getState().incrementFileTreeRefreshVersion(workspaceWorktreePath, changedRelativePaths);
}

// Workspace lifecycle notices are display-state: cross-feature code enqueues
// them through this public surface instead of importing the notice store.
export { enqueueWorkspaceErrorNotice } from "./workspaceLifecycleNoticeStore";
