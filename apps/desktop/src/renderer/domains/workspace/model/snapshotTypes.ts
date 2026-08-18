/**
 * Workspace snapshot view-model types (D17).
 *
 * Structural mirrors of the transport DTOs in `api/types` and
 * `rpc/daemonTypes`. The Workspace Model and State layers use these types so
 * they do not import transport implementations (R6/R7). Shapes are identical
 * to the DTOs, so no runtime conversion is required.
 */

export type DaemonLocalFolder = {
  id: string;
  path: string;
  name?: string;
  state?: string;
  health?: string;
};

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

export type ProjectRecord = {
  id: string;
  name: string;
  sourceType: "git" | "git-local" | "unknown";
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
  commands?: { name: string; command: string }[];
  contextEnabled: boolean;
  organizationId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
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
