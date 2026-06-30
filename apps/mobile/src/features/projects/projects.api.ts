import { apiRequest } from "@/lib/api/client";
import type { CreateProjectInput, Project, ProjectWithWorkspaces, UpdateProjectInput } from "./projects.types";

export function listProjects(
  accessToken: string,
  organizationId: string,
  options: { withWorkspaces: true },
): Promise<ProjectWithWorkspaces[]>;
export function listProjects(
  accessToken: string,
  organizationId: string,
  options?: { withWorkspaces?: false | undefined },
): Promise<Project[]>;
export async function listProjects(
  accessToken: string,
  organizationId: string,
  options?: { withWorkspaces?: boolean },
): Promise<Project[] | ProjectWithWorkspaces[]> {
  const searchParams = new URLSearchParams();
  if (options?.withWorkspaces) {
    searchParams.set("withWorkspaces", "true");
  }

  const response = await apiRequest<{ projects: Project[] | ProjectWithWorkspaces[] }>(
    `/orgs/${organizationId}/projects${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    {
      accessToken,
    },
  );

  return response.projects;
}

export async function createProject(accessToken: string, organizationId: string, input: CreateProjectInput) {
  const response = await apiRequest<{ project: Project }>(`/orgs/${organizationId}/projects`, {
    method: "POST",
    accessToken,
    body: input,
  });

  return response.project;
}

export async function updateProject(
  accessToken: string,
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  const response = await apiRequest<{ project: Project }>(`/orgs/${organizationId}/projects/${projectId}`, {
    method: "PUT",
    accessToken,
    body: input,
  });

  return response.project;
}

export async function deleteProject(accessToken: string, organizationId: string, projectId: string) {
  await apiRequest<{ ok: true }>(`/orgs/${organizationId}/projects/${projectId}`, {
    method: "DELETE",
    accessToken,
  });
}
