import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  CreateProjectBodyInput,
  CreateWorkspaceBodyInput,
  OrganizationProjectParamsInput,
  ProjectWorkspaceParamsInput
} from "@/validation/project";

export async function listProjectsHandler(c: AppContext, params: OrganizationProjectParamsInput) {
  const actorUser = c.get("sessionUser");
  const projects = await c.get("services").project.listProjects({
    actorUserId: actorUser.id,
    organizationId: params.orgId
  });

  return c.json({ projects });
}

export async function createProjectHandler(
  c: AppContext,
  params: OrganizationProjectParamsInput,
  body: CreateProjectBodyInput
) {
  const actorUser = c.get("sessionUser");
  const project = await c.get("services").project.createProject({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    name: body.name,
    sourceTypeHint: body.sourceTypeHint,
    repoUrl: body.repoUrl,
    nodeId: body.nodeId,
    localPath: body.localPath
  });

  return c.json({ project }, StatusCodes.CREATED);
}

export async function listWorkspacesHandler(c: AppContext, params: ProjectWorkspaceParamsInput) {
  const actorUser = c.get("sessionUser");
  const workspaces = await c.get("services").project.listWorkspaces({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId
  });

  return c.json({ workspaces });
}

export async function createWorkspaceHandler(
  c: AppContext,
  params: ProjectWorkspaceParamsInput,
  body: CreateWorkspaceBodyInput
) {
  const actorUser = c.get("sessionUser");
  const workspace = await c.get("services").project.createWorkspace({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    nodeId: body.nodeId,
    kind: body.kind,
    branch: body.branch,
    localPath: body.localPath
  });

  return c.json({ workspace }, StatusCodes.CREATED);
}
