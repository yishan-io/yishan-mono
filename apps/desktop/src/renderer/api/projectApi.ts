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
    sourceTypeHint?: "unknown" | "git-local" | "git";
    repoUrl?: string;
    nodeId?: string;
    localPath?: string;
    contextEnabled?: boolean;
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

/** Updates one project in one organization. */
export async function updateProject(
  orgId: string,
  projectId: string,
  input: {
    name?: string;
    icon?: string;
    color?: string;
    setupScript?: string;
    postScript?: string;
    commands?: Array<{ name: string; command: string }>;
    contextEnabled?: boolean;
  },
): Promise<ProjectRecord> {
  const response = await requestJson<{ project: ProjectRecord }>(`/orgs/${orgId}/projects/${projectId}`, {
    method: "PUT",
    body: input,
  });
  return response.project;
}
