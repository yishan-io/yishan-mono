import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type { CreateProjectBodyInput, OrganizationProjectParamsInput, ProjectWorkspaceParamsInput } from "@/validation/project";

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

export async function deleteProjectHandler(c: AppContext, params: ProjectWorkspaceParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").project.deleteProject({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId
  });

  return c.json({ ok: true });
}
