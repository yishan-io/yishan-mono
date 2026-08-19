/**
 * Git pull-request projection model (Domains plan D10).
 *
 * Feature-owned view model for the Git projection Store. The daemon/API
 * transport DTOs are structurally compatible, so the Store and UI consume
 * these types and the transport boundary (commands) assigns them directly.
 */

/** Live pull-request projection for one workspace (mirrors the daemon DTO shape). */
export type GitPullRequest = {
  number: number;
  title?: string;
  url?: string;
  branch?: string;
  baseBranch?: string;
  githubState?: string;
  status?: string;
  reviewDecision?: string;
  isDraft?: boolean;
  complete?: boolean;
  updatedAt?: string;
  checks?: GitPullRequestCheck[];
  deployments?: GitPullRequestDeployment[];
};

export type GitPullRequestCheck = {
  name: string;
  workflow?: string;
  state: string;
  description?: string;
  url?: string;
};

export type GitPullRequestDeployment = {
  id: number;
  environment?: string;
  state?: string;
  description?: string;
  environmentUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  originalPayload?: string;
};

/** Resolved pull-request summary for one workspace (mirrors the API DTO shape). */
export type GitPullRequestSummary = {
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
