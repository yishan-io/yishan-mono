import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  CreateProjectBodyInput,
  OrganizationProjectListQueryInput,
  OrganizationProjectParamsInput,
  ProjectWorkspaceParamsInput,
  UpdateProjectBodyInput
} from "@/validation/project";

export async function listProjectsHandler(
  c: AppContext,
  params: OrganizationProjectParamsInput,
  query: OrganizationProjectListQueryInput
) {
  const actorUser = c.get("sessionUser");
  const projects = await c.get("services").project.listProjects({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    withWorkspaces: query.withWorkspaces === true
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
  await c.get("services").relayEvent.publishWorkspaceSnapshotChanged({
    organizationId: params.orgId,
    resource: "project",
    change: "created",
    projectId: project.id,
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
  await c.get("services").relayEvent.publishWorkspaceSnapshotChanged({
    organizationId: params.orgId,
    resource: "project",
    change: "deleted",
    projectId: params.projectId,
  });

  return c.json({ ok: true });
}

export async function updateProjectHandler(
  c: AppContext,
  params: ProjectWorkspaceParamsInput,
  body: UpdateProjectBodyInput
) {
  const actorUser = c.get("sessionUser");
  const project = await c.get("services").project.updateProject({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    name: body.name,
    icon: body.icon,
    color: body.color,
    setupScript: body.setupScript,
    postScript: body.postScript,
    contextEnabled: body.contextEnabled
  });
  await c.get("services").relayEvent.publishWorkspaceSnapshotChanged({
    organizationId: params.orgId,
    resource: "project",
    change: "updated",
    projectId: project.id,
  });

  return c.json({ project }, StatusCodes.OK);
}
