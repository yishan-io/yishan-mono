/** Feature-owned workspace lifecycle status (replaces api WorkspaceRecord["status"] refs in stores). */
export type WorkspaceStatus = "active" | "closed" | "provisioning";

/**
 * Workspace Store `addWorkspace` action input (desktop6-adjust.md W1).
 * Defined in the Workspace model so Commands, Events, and model builders can
 * use it without importing Store State.
 */
export type AddWorkspaceInput = {
  organizationId?: string;
  projectId?: string;
  repoId?: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath?: string;
  nodeId?: string;
  workspaceId: string;
  status?: WorkspaceStatus;
  preserveOnMissingSnapshot?: boolean;
};

/**
 * Workspace feature vocabulary (Phase 3 split of features/workbench/model/types.ts).
 * Feature-owned status unions replace transport DTO references.
 */

export type WorkspaceLifecycleState = "active" | "error" | "closing";

export type WorkspaceHealth = "path-missing" | "not-worktree";

export type WorkspaceGitChangeTotals = {
  additions: number;
  deletions: number;
};

export type WorkspaceItem = {
  id: string;
  organizationId?: string;
  projectId?: string;
  repoId: string;
  name: string;
  title: string;
  sourceBranch: string;
  branch: string;
  summaryId: string;
  worktreePath?: string;
  nodeId?: string;
  kind?: "managed" | "local" | "folder";
  status?: WorkspaceStatus;
  preserveOnMissingSnapshot?: boolean;
  state?: WorkspaceLifecycleState;
  health?: WorkspaceHealth;
};

/** Resolves the owning project id for a workspace (folder workspaces use their repo id). */
export function resolveWorkspaceProjectId(workspace: { projectId?: string; repoId: string }): string {
  return workspace.projectId ?? workspace.repoId;
}

/** Resolves the workspace to activate for a project (first workspace of the project, or ""). */
export function resolveWorkspaceIdForProject(workspaces: WorkspaceItem[], projectId: string): string {
  return workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === projectId)?.id ?? "";
}
