import { requestJson } from "./restClient";
import type { ProjectRecord } from "./types";

/** Lists projects for one organization. */
export async function listProjects(orgId: string): Promise<ProjectRecord[]> {
  const response = await requestJson<{ projects: ProjectRecord[] }>(`/orgs/${orgId}/projects`);
  return response.projects;
}

/** Creates one project in one organization. */
export async function createProject(
  orgId: string,
  input: {
    name: string;
    sourceTypeHint?: "unknown" | "git-local";
    repoUrl?: string;
    nodeId?: string;
    localPath?: string;
  },
): Promise<ProjectRecord> {
  const response = await requestJson<{ project: ProjectRecord }>(`/orgs/${orgId}/projects`, {
    method: "POST",
    body: input,
  });
  return response.project;
}

/** Deletes one project from one organization. */
export async function deleteProject(orgId: string, projectId: string): Promise<void> {
  await requestJson<{ ok?: boolean }>(`/orgs/${orgId}/projects/${projectId}`, {
    method: "DELETE",
  });
}
