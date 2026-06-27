import { getRelayBaseUrl } from "@/lib/config/env";
import { withPooledRelayRequestClient } from "@/lib/relay/relay-request-client-pool";
import type { RelayStreamClient } from "@/lib/relay/relay-stream-client";
import {
  normalizeRelayWorkspaceBranchesResult,
  normalizeRelayWorkspaceChangesResult,
  normalizeRelayWorkspaceDiffResult,
  normalizeRelayWorkspaceFileResult,
  normalizeRelayWorkspaceFilesResult,
} from "./workspaces-relay-domain";
import type {
  WorkspaceFileContent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceGitBranchList,
  WorkspaceGitChanges,
} from "./workspaces.types";

function requireNodeId(nodeId: string | null | undefined) {
  const normalizedNodeId = nodeId?.trim() ?? "";
  if (!normalizedNodeId) {
    throw new Error("Missing nodeId for relay workspace read.");
  }

  return normalizedNodeId;
}

async function withRelayWorkspaceClient<T>(
  input: {
    accessToken: string;
    nodeId: string | null | undefined;
  },
  action: (client: RelayStreamClient) => Promise<T>,
) {
  return withPooledRelayRequestClient(
    {
      accessToken: input.accessToken,
      nodeId: requireNodeId(input.nodeId),
      relayUrl: getRelayBaseUrl(),
    },
    action,
  );
}

export async function listRelayWorkspaceFiles(input: {
  accessToken: string;
  nodeId: string | null | undefined;
  path?: string;
  recursive?: boolean;
  workspaceId: string;
}): Promise<WorkspaceFileEntry[]> {
  return withRelayWorkspaceClient(input, async (client) => {
    const result = await client.sendRequest<unknown[]>("file.list", {
      path: input.path?.trim() ?? "",
      recursive: input.recursive ?? false,
      workspaceId: input.workspaceId,
    });

    return normalizeRelayWorkspaceFilesResult(input.workspaceId, result);
  });
}

export async function readRelayWorkspaceFile(input: {
  accessToken: string;
  maxChars?: number;
  nodeId: string | null | undefined;
  path: string;
  workspaceId: string;
}): Promise<WorkspaceFileContent> {
  return withRelayWorkspaceClient(input, async (client) => {
    const normalizedPath = input.path.trim();
    const result = await client.sendRequest("file.read", {
      path: normalizedPath,
      workspaceId: input.workspaceId,
    });

    return normalizeRelayWorkspaceFileResult(input.workspaceId, normalizedPath, result, input.maxChars);
  });
}

export async function readRelayWorkspaceDiff(input: {
  accessToken: string;
  maxChars?: number;
  nodeId: string | null | undefined;
  path: string;
  workspaceId: string;
}): Promise<WorkspaceFileDiff> {
  return withRelayWorkspaceClient(input, async (client) => {
    const normalizedPath = input.path.trim();
    const result = await client.sendRequest("file.diff", {
      path: normalizedPath,
      workspaceId: input.workspaceId,
    });

    return normalizeRelayWorkspaceDiffResult(input.workspaceId, normalizedPath, result, input.maxChars);
  });
}

export async function listRelayWorkspaceGitChanges(input: {
  accessToken: string;
  nodeId: string | null | undefined;
  workspaceId: string;
}): Promise<WorkspaceGitChanges> {
  return withRelayWorkspaceClient(input, async (client) => {
    const result = await client.sendRequest("git.listChanges", {
      workspaceId: input.workspaceId,
    });

    return normalizeRelayWorkspaceChangesResult(input.workspaceId, result);
  });
}

export async function listRelayWorkspaceGitBranches(input: {
  accessToken: string;
  nodeId: string | null | undefined;
  workspaceId: string;
}): Promise<WorkspaceGitBranchList> {
  return withRelayWorkspaceClient(input, async (client) => {
    const result = await client.sendRequest("git.branches", {
      workspaceId: input.workspaceId,
    });

    return normalizeRelayWorkspaceBranchesResult(input.workspaceId, result);
  });
}
