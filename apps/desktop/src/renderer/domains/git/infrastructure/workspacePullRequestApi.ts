import type { WorkspacePullRequestRecord } from "@renderer/api/types";

export type { WorkspacePullRequestRecord };
import { requestJson } from "@renderer/api/restClient";

/** Lists all pull requests recorded for one workspace, ordered by detected_at desc. */
export async function listWorkspacePullRequests(
  orgId: string,
  projectId: string,
  workspaceId: string,
): Promise<WorkspacePullRequestRecord[]> {
  const response = await requestJson<{ pullRequests: WorkspacePullRequestRecord[] }>(
    `/orgs/${orgId}/projects/${projectId}/workspaces/${workspaceId}/pull-requests`,
  );
  return response.pullRequests;
}

/** Upserts a pull request snapshot for one workspace. */
export async function upsertWorkspacePullRequest(
  orgId: string,
  projectId: string,
  workspaceId: string,
  input: {
    prId: string;
    title?: string;
    url?: string;
    branch?: string;
    baseBranch?: string;
    state: "open" | "closed" | "merged";
    metadata?: Record<string, unknown>;
    detectedAt: string;
    resolvedAt?: string;
  },
): Promise<WorkspacePullRequestRecord> {
  const response = await requestJson<{ pullRequest: WorkspacePullRequestRecord }>(
    `/orgs/${orgId}/projects/${projectId}/workspaces/${workspaceId}/pull-requests`,
    { method: "PUT", body: input },
  );
  return response.pullRequest;
}
