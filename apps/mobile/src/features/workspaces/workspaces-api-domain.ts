import type { Workspace, WorkspaceCurrentPullRequest, WorkspacePullRequestSummary } from "./workspaces.types";

export type WorkspacesResponseRecord = {
  workspaces: Workspace[];
};

export type WorkspaceResponseRecord = {
  workspace: Workspace;
};

export type WorkspacePullRequestsResponseRecord = {
  pullRequests: WorkspacePullRequestSummary[];
};

export type WorkspacePullRequestRefreshResponseRecord = {
  pullRequest: WorkspaceCurrentPullRequest | null;
};

export function readWorkspacesResponse(response: WorkspacesResponseRecord): Workspace[] {
  return response.workspaces;
}

export function readWorkspaceResponse(response: WorkspaceResponseRecord): Workspace {
  return response.workspace;
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
