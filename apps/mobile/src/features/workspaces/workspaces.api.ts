import { apiRequest } from "@/lib/api/client";
import {
  type WorkspacePullRequestRefreshResponseRecord,
  type WorkspacePullRequestsResponseRecord,
  type WorkspaceResponseRecord,
  type WorkspacesResponseRecord,
  readWorkspaceCurrentPullRequestResponse,
  readWorkspacePullRequestsResponse,
  readWorkspaceResponse,
  readWorkspacesResponse,
} from "./workspaces-api-domain";
import type { Workspace, WorkspaceCurrentPullRequest, WorkspacePullRequestSummary } from "./workspaces.types";

export async function listWorkspaces(
  accessToken: string,
  organizationId: string,
  projectId: string,
): Promise<Workspace[]> {
  const response = await apiRequest<WorkspacesResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces`,
    {
      accessToken,
    },
  );

  return readWorkspacesResponse(response);
}

export async function closeWorkspace(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspace: Workspace,
): Promise<Workspace> {
  const response = await apiRequest<WorkspaceResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/close`,
    {
      method: "PATCH",
      accessToken,
      body: {
        workspaceId: workspace.id,
      },
    },
  );

  return readWorkspaceResponse(response);
}

export async function listWorkspacePullRequests(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
): Promise<WorkspacePullRequestSummary[]> {
  const response = await apiRequest<WorkspacePullRequestsResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/pull-requests`,
    {
      accessToken,
    },
  );

  return readWorkspacePullRequestsResponse(response);
}

export async function refreshWorkspacePullRequest(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceCurrentPullRequest | null> {
  const response = await apiRequest<WorkspacePullRequestRefreshResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/pull-request/refresh`,
    {
      method: "POST",
      accessToken,
    },
  );

  return readWorkspaceCurrentPullRequestResponse(response);
}
