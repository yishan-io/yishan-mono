/** Feature-owned workspace lifecycle status (replaces api WorkspaceRecord["status"] refs in stores). */
export type WorkspaceStatus = "active" | "closed" | "provisioning";

/**
 * Workspace feature vocabulary (Phase 3 split of store/types.ts).
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
