/**
 * Shared git change kinds used across desktop, mobile, and api-service workspace views.
 */
export const WORKSPACE_GIT_CHANGE_KINDS = ["added", "modified", "deleted", "renamed", "untracked"] as const;

/**
 * Normalized git change kind for workspace file changes.
 */
export type WorkspaceGitChangeKind = (typeof WORKSPACE_GIT_CHANGE_KINDS)[number];

/**
 * A file-system entry returned from workspace file listing APIs.
 */
export type WorkspaceFileEntry = {
  path: string;
  name: string;
  isDir: boolean;
  isIgnored?: boolean;
  size: number;
  mode: number;
};

/**
 * Previewable file content returned from workspace file read APIs.
 */
export type WorkspaceFileContent = {
  path: string;
  content: string;
  truncated?: boolean;
};

/**
 * Diff content returned from workspace file diff APIs.
 */
export type WorkspaceFileDiff = {
  path: string;
  oldContent: string;
  newContent: string;
  previewUnavailable?: boolean;
  truncated?: boolean;
};

/**
 * A single git change row within a workspace changes list.
 */
export type WorkspaceGitChange = {
  path: string;
  kind: WorkspaceGitChangeKind;
  additions: number;
  deletions: number;
};

/**
 * Git changes grouped by section for workspace views.
 */
export type WorkspaceGitChanges = {
  unstaged: WorkspaceGitChange[];
  staged: WorkspaceGitChange[];
  untracked: WorkspaceGitChange[];
};

/**
 * Branch list returned from workspace git branch APIs.
 */
export type WorkspaceGitBranchList = {
  currentBranch: string;
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
};

/**
 * One CI/check entry attached to the current workspace pull request.
 */
export type WorkspaceCurrentPullRequestCheck = {
  name: string;
  workflow?: string;
  state: string;
  description?: string;
  url?: string;
};

/**
 * One deployment entry attached to the current workspace pull request.
 */
export type WorkspaceCurrentPullRequestDeployment = {
  id: number;
  environment?: string;
  state?: string;
  description?: string;
  environmentUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  originalPayload?: string;
};

/**
 * Live/current pull-request snapshot returned from the daemon for the active branch.
 */
export type WorkspaceCurrentPullRequest = {
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
  checks?: WorkspaceCurrentPullRequestCheck[];
  deployments?: WorkspaceCurrentPullRequestDeployment[];
};
