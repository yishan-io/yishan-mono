import type {
  Workspace,
  WorkspaceCurrentPullRequest,
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChanges,
  WorkspacePullRequestSummary,
  WorkspaceTerminalSession,
} from "./workspaces.types";

export type WorkspacesResponseRecord = {
  workspaces: Workspace[];
};

export type WorkspaceResponseRecord = {
  workspace: Workspace;
};

export type WorkspaceFilesResponseRecord = {
  files: WorkspaceFileEntry[];
};

export type WorkspaceFileResponseRecord = {
  file: WorkspaceFileContent;
};

export type WorkspaceDiffResponseRecord = {
  diff: WorkspaceFileDiff;
};

export type WorkspaceChangesResponseRecord = {
  changes: WorkspaceGitChanges;
};

export type WorkspaceGitBranchesResponseRecord = {
  branches: WorkspaceGitBranchList;
};

export type WorkspacePullRequestsResponseRecord = {
  pullRequests: WorkspacePullRequestSummary[];
};

export type WorkspacePullRequestRefreshResponseRecord = {
  pullRequest: WorkspaceCurrentPullRequest | null;
};

export type WorkspaceTerminalSessionsResponseRecord = {
  sessions: WorkspaceTerminalSession[];
};

export type StartWorkspaceTerminalResponseRecord = {
  session: {
    sessionId: string;
  };
};

export function readWorkspacesResponse(response: WorkspacesResponseRecord): Workspace[] {
  return response.workspaces;
}

export function readWorkspaceResponse(response: WorkspaceResponseRecord): Workspace {
  return response.workspace;
}

export function readWorkspaceFilesResponse(response: WorkspaceFilesResponseRecord): WorkspaceFileEntry[] {
  return response.files;
}

export function readWorkspaceFileResponse(response: WorkspaceFileResponseRecord): WorkspaceFileContent {
  return response.file;
}

export function readWorkspaceDiffResponse(response: WorkspaceDiffResponseRecord): WorkspaceFileDiff {
  return response.diff;
}

export function readWorkspaceChangesResponse(response: WorkspaceChangesResponseRecord): WorkspaceGitChanges {
  return response.changes;
}

export function readWorkspaceGitBranchesResponse(response: WorkspaceGitBranchesResponseRecord): WorkspaceGitBranchList {
  return response.branches;
}

export function readWorkspacePullRequestsResponse(
  response: WorkspacePullRequestsResponseRecord,
): WorkspacePullRequestSummary[] {
  return response.pullRequests;
}

export function readWorkspaceCurrentPullRequestResponse(
  response: WorkspacePullRequestRefreshResponseRecord,
): WorkspaceCurrentPullRequest | null {
  return response.pullRequest;
}

export function readWorkspaceTerminalSessionsResponse(
  response: WorkspaceTerminalSessionsResponseRecord,
): WorkspaceTerminalSession[] {
  return response.sessions;
}

export function readStartedWorkspaceTerminalSessionResponse(response: StartWorkspaceTerminalResponseRecord): {
  sessionId: string;
} {
  return response.session;
}

export function buildWorkspaceWebSocketUrl({
  accessToken,
  apiBaseUrl,
  pathname,
}: {
  accessToken?: string | null;
  apiBaseUrl: string;
  pathname: string;
}): string {
  const baseUrl = new URL(apiBaseUrl);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = pathname;
  baseUrl.search = "";
  if (accessToken) {
    baseUrl.searchParams.set("accessToken", accessToken);
  }
  return baseUrl.toString();
}
