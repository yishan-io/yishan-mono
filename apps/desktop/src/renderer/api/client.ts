import { listOrganizationNodes } from "./nodeApi";
import { createOrganization, listOrganizations } from "./orgApi";
import { createProject, deleteProject, listProjects } from "./projectApi";
import { createProjectWorkspace, listProjectWorkspaces } from "./workspaceApi";

export const api = {
  org: {
    list: listOrganizations,
    create: createOrganization,
  },
  node: {
    listByOrg: listOrganizationNodes,
  },
  project: {
    listByOrg: listProjects,
    create: createProject,
    delete: deleteProject,
  },
  workspace: {
    listByProject: listProjectWorkspaces,
    createForProject: createProjectWorkspace,
  },
};

export type ApiClient = typeof api;
