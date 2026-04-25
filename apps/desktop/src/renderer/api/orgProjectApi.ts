import { requestJson } from "./restClient";

export type OrganizationRecord = {
  id: string;
  name: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  sourceType: "git" | "git-local" | "unknown";
  repoProvider: string | null;
  repoUrl: string | null;
  repoKey: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type ProjectWorkspaceRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  nodeId: string;
  kind: "primary" | "worktree";
  branch: string | null;
  localPath: string;
  createdAt: string;
  updatedAt: string;
};

/** Lists organizations visible to the signed-in user. */
export async function listOrganizations(): Promise<OrganizationRecord[]> {
  const response = await requestJson<{ organizations: OrganizationRecord[] }>("/orgs");
  return response.organizations;
}

/** Creates one organization. */
export async function createOrganization(name: string): Promise<OrganizationRecord> {
  const response = await requestJson<{ organization: OrganizationRecord }>("/orgs", {
    method: "POST",
    body: { name },
  });

  return response.organization;
}

/** Lists projects for one organization. */
export async function listProjects(orgId: string): Promise<ProjectRecord[]> {
  const response = await requestJson<{ projects: ProjectRecord[] }>(`/orgs/${orgId}/projects`);
  return response.projects;
}

/** Lists project workspaces for one organization project. */
export async function listProjectWorkspaces(orgId: string, projectId: string): Promise<ProjectWorkspaceRecord[]> {
  const response = await requestJson<{ workspaces: ProjectWorkspaceRecord[] }>(`/orgs/${orgId}/projects/${projectId}/workspaces`);
  return response.workspaces;
}

/** Creates one project in one organization. */
export async function createProject(
  orgId: string,
  input: {
    name: string;
    sourceTypeHint?: "unknown" | "git-local";
    repoUrl?: string;
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
