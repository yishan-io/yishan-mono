import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type { CloseWorkspaceBodyInput, CreateWorkspaceBodyInput, ProjectWorkspaceParamsInput } from "@/validation/project";

export async function listWorkspacesHandler(c: AppContext, params: ProjectWorkspaceParamsInput) {
  const actorUser = c.get("sessionUser");
  const workspaces = await c.get("services").workspace.listWorkspaces({
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
  const workspace = await c.get("services").workspace.createWorkspace({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    nodeId: body.nodeId,
    kind: body.kind,
    branch: body.branch,
    sourceBranch: body.sourceBranch,
    localPath: body.localPath
  });

  return c.json({ workspace }, StatusCodes.CREATED);
}

export async function closeWorkspaceHandler(
  c: AppContext,
  params: ProjectWorkspaceParamsInput,
  body: CloseWorkspaceBodyInput
) {
  const actorUser = c.get("sessionUser");
  const workspace = await c.get("services").workspace.closeWorkspace({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    nodeId: body.nodeId,
    kind: body.kind,
    branch: body.branch,
    localPath: body.localPath
  });

  return c.json({ workspace });
}
