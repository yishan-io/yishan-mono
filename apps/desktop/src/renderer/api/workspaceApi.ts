import { requestJson } from "./restClient";
import type { WorkspaceRecord } from "./types";

/** Lists project workspaces for one organization project. */
export async function listProjectWorkspaces(orgId: string, projectId: string): Promise<WorkspaceRecord[]> {
  const response = await requestJson<{ workspaces: WorkspaceRecord[] }>(`/orgs/${orgId}/projects/${projectId}/workspaces`);
  return response.workspaces;
}

/** Creates one workspace under one project. */
export async function createProjectWorkspace(
  orgId: string,
  projectId: string,
  input: {
    nodeId: string;
    kind?: "primary" | "worktree";
    branch?: string;
    localPath: string;
  },
): Promise<WorkspaceRecord> {
  const response = await requestJson<{ workspace: WorkspaceRecord }>(`/orgs/${orgId}/projects/${projectId}/workspaces`, {
    method: "POST",
    body: input,
  });

  return response.workspace;
}
