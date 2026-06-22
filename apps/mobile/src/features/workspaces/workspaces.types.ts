export type {
  WorkspaceCurrentPullRequest,
  WorkspaceCurrentPullRequestCheck,
  WorkspaceCurrentPullRequestDeployment,
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChange,
  WorkspaceGitChangeKind,
  WorkspaceGitChanges,
} from "@yishan/core";

export type Workspace = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  status: "active" | "closed";
  branch: string | null;
  sourceBranch: string | null;
  localPath: string;
  latestPullRequest: WorkspacePullRequestSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacePullRequestState = "open" | "closed" | "merged";

export type WorkspacePullRequestSummary = {
  id: string;
  prId: string;
  title: string | null;
  url: string | null;
  branch: string | null;
  baseBranch: string | null;
  state: WorkspacePullRequestState;
  metadata: unknown;
  detectedAt: string;
  resolvedAt: string | null;
};

export type WorkspaceTerminalSession = {
  sessionId: string;
  workspaceId: string;
  tabId?: string;
  paneId?: string;
  pid: number;
  status: "running" | "exited";
  startedAt?: string;
  exitedAt?: string;
};

export type WorkspaceTerminalOutput = {
  output: string;
  running: boolean;
  exitCode?: number | null;
};
