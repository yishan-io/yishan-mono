import { requestJson } from "./restClient";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "./types";

/** Lists projects for one organization. */
export async function listProjects(
  orgId: string,
  options: { withWorkspaces: true },
): Promise<ProjectWithWorkspacesRecord[]>;
export async function listProjects(orgId: string, options?: { withWorkspaces?: false }): Promise<ProjectRecord[]>;
export async function listProjects(
  orgId: string,
  options?: { withWorkspaces?: boolean },
): Promise<ProjectRecord[] | ProjectWithWorkspacesRecord[]> {
  const query = options?.withWorkspaces === true ? "?withWorkspaces=true" : "";
  const response = await requestJson<{ projects: ProjectRecord[] | ProjectWithWorkspacesRecord[] }>(
    `/orgs/${orgId}/projects${query}`,
  );
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
): Promise<ProjectWithWorkspacesRecord> {
  const response = await requestJson<{ project: ProjectWithWorkspacesRecord }>(`/orgs/${orgId}/projects`, {
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
