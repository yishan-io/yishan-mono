import { apiRequest } from "@/lib/api/client";
import { getApiBaseUrl } from "@/lib/config/env";
import {
  type StartWorkspaceTerminalResponseRecord,
  type WorkspaceChangesResponseRecord,
  type WorkspaceDiffResponseRecord,
  type WorkspaceFileResponseRecord,
  type WorkspaceFilesResponseRecord,
  type WorkspaceGitBranchesResponseRecord,
  type WorkspacePullRequestRefreshResponseRecord,
  type WorkspacePullRequestsResponseRecord,
  type WorkspaceResponseRecord,
  type WorkspaceTerminalOutputResponseRecord,
  type WorkspaceTerminalSessionsResponseRecord,
  type WorkspacesResponseRecord,
  buildWorkspaceWebSocketUrl,
  readStartedWorkspaceTerminalSessionResponse,
  readWorkspaceChangesResponse,
  readWorkspaceCurrentPullRequestResponse,
  readWorkspaceDiffResponse,
  readWorkspaceFileResponse,
  readWorkspaceFilesResponse,
  readWorkspaceGitBranchesResponse,
  readWorkspacePullRequestsResponse,
  readWorkspaceResponse,
  readWorkspaceTerminalOutputResponse,
  readWorkspaceTerminalSessionsResponse,
  readWorkspacesResponse,
} from "./workspaces-api-domain";
import type {
  Workspace,
  WorkspaceCurrentPullRequest,
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChanges,
  WorkspacePullRequestSummary,
  WorkspaceTerminalOutput,
  WorkspaceTerminalSession,
} from "./workspaces.types";

export type CreateWorkspaceInput = {
  nodeId: string;
  localPath: string;
  kind?: "primary" | "worktree";
  name?: string;
  branch?: string;
  sourceBranch?: string;
};

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

export async function createWorkspace(
  accessToken: string,
  organizationId: string,
  projectId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const response = await apiRequest<WorkspaceResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces`,
    {
      method: "POST",
      accessToken,
      body: input,
    },
  );

  return readWorkspaceResponse(response);
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
        kind: workspace.kind,
        branch: workspace.branch ?? undefined,
        nodeId: workspace.nodeId,
        localPath: workspace.localPath,
      },
    },
  );

  return readWorkspaceResponse(response);
}

export async function listWorkspaceFiles(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    path?: string;
    recursive?: boolean;
  },
): Promise<WorkspaceFileEntry[]> {
  const searchParams = new URLSearchParams();
  if (options?.path) {
    searchParams.set("path", options.path);
  }
  if (options?.recursive) {
    searchParams.set("recursive", "true");
  }

  const queryString = searchParams.toString();
  const response = await apiRequest<WorkspaceFilesResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/files${queryString ? `?${queryString}` : ""}`,
    {
      accessToken,
    },
  );

  return readWorkspaceFilesResponse(response);
}

export async function readWorkspaceFile(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  path: string,
  options?: {
    maxChars?: number;
  },
): Promise<WorkspaceFileContent> {
  const searchParams = new URLSearchParams();
  searchParams.set("path", path);
  if (typeof options?.maxChars === "number" && options.maxChars > 0) {
    searchParams.set("maxChars", String(options.maxChars));
  }

  const response = await apiRequest<WorkspaceFileResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/files/read?${searchParams.toString()}`,
    {
      accessToken,
    },
  );

  return readWorkspaceFileResponse(response);
}

export async function readWorkspaceDiff(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  path: string,
  options?: {
    maxChars?: number;
  },
): Promise<WorkspaceFileDiff> {
  const searchParams = new URLSearchParams();
  searchParams.set("path", path);
  if (typeof options?.maxChars === "number" && options.maxChars > 0) {
    searchParams.set("maxChars", String(options.maxChars));
  }

  const response = await apiRequest<WorkspaceDiffResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/files/diff?${searchParams.toString()}`,
    {
      accessToken,
    },
  );

  return readWorkspaceDiffResponse(response);
}

export async function listWorkspaceGitChanges(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceGitChanges> {
  const response = await apiRequest<WorkspaceChangesResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/changes`,
    {
      accessToken,
    },
  );

  return readWorkspaceChangesResponse(response);
}

export async function listWorkspaceGitBranches(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
): Promise<WorkspaceGitBranchList> {
  const response = await apiRequest<WorkspaceGitBranchesResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/git/branches`,
    {
      accessToken,
    },
  );

  return readWorkspaceGitBranchesResponse(response);
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

export async function listWorkspaceTerminalSessions(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    includeExited?: boolean;
  },
): Promise<WorkspaceTerminalSession[]> {
  const searchParams = new URLSearchParams();
  if (options?.includeExited) {
    searchParams.set("includeExited", "true");
  }

  const response = await apiRequest<WorkspaceTerminalSessionsResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/terminal/sessions${
      searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`,
    {
      accessToken,
    },
  );

  return readWorkspaceTerminalSessionsResponse(response);
}

export async function startWorkspaceTerminal(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  input?: {
    command?: string;
    args?: string[];
    cols?: number;
    env?: string[];
    rows?: number;
    tabId?: string;
    paneId?: string;
  },
): Promise<{ sessionId: string }> {
  const response = await apiRequest<StartWorkspaceTerminalResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/terminal/sessions`,
    {
      method: "POST",
      accessToken,
      body: input ?? {},
    },
  );

  return readStartedWorkspaceTerminalSessionResponse(response);
}

export async function readWorkspaceTerminalOutput(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  sessionId: string,
): Promise<WorkspaceTerminalOutput> {
  const response = await apiRequest<WorkspaceTerminalOutputResponseRecord>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/terminal/sessions/${sessionId}/output`,
    {
      accessToken,
    },
  );

  return readWorkspaceTerminalOutputResponse(response);
}

export async function stopWorkspaceTerminal(
  accessToken: string,
  organizationId: string,
  projectId: string,
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/terminal/sessions/${sessionId}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}

export function buildWorkspaceTerminalWebSocketUrl(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  sessionId: string,
  accessToken?: string | null,
): string {
  return buildWorkspaceWebSocketUrl({
    accessToken,
    apiBaseUrl: getApiBaseUrl(),
    pathname: `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/terminal/sessions/${sessionId}/ws`,
  });
}

export function buildWorkspaceFrontendEventsWebSocketUrl(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  accessToken?: string | null,
): string {
  return buildWorkspaceWebSocketUrl({
    accessToken,
    apiBaseUrl: getApiBaseUrl(),
    pathname: `/orgs/${organizationId}/projects/${projectId}/workspaces/${workspaceId}/events/ws`,
  });
}
