import { api } from "./client";
import type { ProjectWorkspaceRecord } from "./types";
import { sessionStore } from "../store/sessionStore";

export type OrgProjectSnapshot = {
  organizationId?: string;
  projects: Awaited<ReturnType<typeof listProjects>>;
  workspaces: ProjectWorkspaceRecord[];
};

/** Loads one org/project/workspace snapshot from remote REST api-service. */
export async function getOrgProjectSnapshot(): Promise<OrgProjectSnapshot> {
  const sessionState = sessionStore.getState();
  const organizations =
    sessionState.organizations.length > 0 ? sessionState.organizations : await api.org.list();
  const selectedOrganization =
    sessionState.selectedOrganizationId && organizations.some((organization) => organization.id === sessionState.selectedOrganizationId)
      ? organizations.find((organization) => organization.id === sessionState.selectedOrganizationId)
      : organizations[0];

  if (!selectedOrganization) {
    return {
      projects: [],
      workspaces: [],
    };
  }

  const projects = await api.project.listByOrg(selectedOrganization.id);
  const workspaceLists = await Promise.all(
    projects.map(async (project) => {
      return await api.workspace.listByProject(selectedOrganization.id, project.id);
    }),
  );

  return {
    organizationId: selectedOrganization.id,
    projects,
    workspaces: workspaceLists.flat(),
  };
}
