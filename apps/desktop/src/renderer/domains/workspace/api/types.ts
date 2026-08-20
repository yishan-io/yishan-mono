/**
 * Workspace REST/DTO record types (Desktop 11 Phase 47 — moved from the
 * Renderer root `api/types.ts`; the root api directory keeps only the REST
 * transport).
 */

export type WorkspacePullRequestSummary = {
  id: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: "open" | "closed" | "merged";
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
};

export type WorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  status: "active" | "closed" | "provisioning";
  state?: "active" | "error" | "closing";
  health?: "path-missing" | "not-worktree";
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  latestPullRequest: WorkspacePullRequestSummary | null;
  createdAt: string;
  updatedAt: string;
};
