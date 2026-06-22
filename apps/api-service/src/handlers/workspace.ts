import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  CloseWorkspaceBodyInput,
  CreateWorkspaceBodyInput,
  ProjectWorkspaceParamsInput,
  WorkspaceFileDiffParamsInput,
  WorkspaceFileDiffQueryInput,
  WorkspaceFileListParamsInput,
  WorkspaceFileListQueryInput,
  WorkspaceFileReadParamsInput,
  WorkspaceFileReadQueryInput,
  WorkspaceGitBranchesParamsInput,
  WorkspaceGitChangesParamsInput,
  WorkspacePullRequestParamsInput,
  WorkspaceTerminalListQueryInput,
  WorkspaceTerminalParamsInput,
  WorkspaceTerminalResizeBodyInput,
  WorkspaceTerminalSendBodyInput,
  WorkspaceTerminalSessionParamsInput,
  WorkspaceTerminalStartBodyInput,
} from "@/validation/project";

export async function listWorkspacesHandler(c: AppContext, params: ProjectWorkspaceParamsInput) {
  const actorUser = c.get("sessionUser");
  const workspaces = await c.get("services").workspace.listWorkspaces({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
  });

  return c.json({ workspaces });
}

export async function createWorkspaceHandler(
  c: AppContext,
  params: ProjectWorkspaceParamsInput,
  body: CreateWorkspaceBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const workspace = await c.get("services").workspace.createWorkspace({
    id: body.id,
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    nodeId: body.nodeId,
    kind: body.kind,
    name: body.name,
    branch: body.branch,
    sourceBranch: body.sourceBranch,
    localPath: body.localPath,
  });
  await c.get("services").relayEvent.publishWorkspaceSnapshotChanged({
    organizationId: params.orgId,
    resource: "workspace",
    change: "created",
    projectId: params.projectId,
    workspaceId: workspace.id,
  });

  return c.json({ workspace }, StatusCodes.CREATED);
}

export async function closeWorkspaceHandler(
  c: AppContext,
  params: ProjectWorkspaceParamsInput,
  body: CloseWorkspaceBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const closeResult = await c.get("services").workspace.closeWorkspace({
    workspaceId: body.workspaceId,
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
  });
  if (closeResult.changed) {
    await c.get("services").relayEvent.publishWorkspaceSnapshotChanged({
      organizationId: params.orgId,
      resource: "workspace",
      change: "closed",
      projectId: params.projectId,
      workspaceId: closeResult.workspace.id,
    });
  }

  return c.json({ workspace: closeResult.workspace });
}

export async function listWorkspaceFilesHandler(
  c: AppContext,
  params: WorkspaceFileListParamsInput,
  query: WorkspaceFileListQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const files = await c.get("services").workspace.listWorkspaceFiles({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    path: query.path,
    projectId: params.projectId,
    recursive: query.recursive,
    workspaceId: params.workspaceId,
  });

  return c.json({ files });
}

export async function readWorkspaceFileHandler(
  c: AppContext,
  params: WorkspaceFileReadParamsInput,
  query: WorkspaceFileReadQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const file = await c.get("services").workspace.readWorkspaceFile({
    actorUserId: actorUser.id,
    maxChars: query.maxChars,
    organizationId: params.orgId,
    path: query.path,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ file });
}

export async function readWorkspaceDiffHandler(
  c: AppContext,
  params: WorkspaceFileDiffParamsInput,
  query: WorkspaceFileDiffQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const diff = await c.get("services").workspace.readWorkspaceDiff({
    actorUserId: actorUser.id,
    maxChars: query.maxChars,
    organizationId: params.orgId,
    path: query.path,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ diff });
}

export async function listWorkspaceGitChangesHandler(c: AppContext, params: WorkspaceGitChangesParamsInput) {
  const actorUser = c.get("sessionUser");
  const changes = await c.get("services").workspace.listWorkspaceGitChanges({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ changes });
}

export async function listWorkspaceGitBranchesHandler(c: AppContext, params: WorkspaceGitBranchesParamsInput) {
  const actorUser = c.get("sessionUser");
  const branches = await c.get("services").workspace.listWorkspaceGitBranches({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ branches });
}

export async function refreshWorkspacePullRequestHandler(c: AppContext, params: WorkspacePullRequestParamsInput) {
  const actorUser = c.get("sessionUser");
  const pullRequest = await c.get("services").workspace.refreshWorkspacePullRequest({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ pullRequest });
}

export async function listWorkspaceTerminalSessionsHandler(
  c: AppContext,
  params: WorkspaceTerminalParamsInput,
  query: WorkspaceTerminalListQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const sessions = await c.get("services").workspace.listWorkspaceTerminalSessions({
    actorUserId: actorUser.id,
    includeExited: query.includeExited,
    organizationId: params.orgId,
    projectId: params.projectId,
    workspaceId: params.workspaceId,
  });

  return c.json({ sessions });
}

export async function startWorkspaceTerminalHandler(
  c: AppContext,
  params: WorkspaceTerminalParamsInput,
  body: WorkspaceTerminalStartBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const session = await c.get("services").workspace.startWorkspaceTerminal({
    actorUserId: actorUser.id,
    args: body.args,
    cols: body.cols,
    command: body.command,
    env: body.env,
    organizationId: params.orgId,
    paneId: body.paneId,
    projectId: params.projectId,
    rows: body.rows,
    tabId: body.tabId,
    workspaceId: params.workspaceId,
  });

  return c.json({ session }, StatusCodes.CREATED);
}

export async function sendWorkspaceTerminalInputHandler(
  c: AppContext,
  params: WorkspaceTerminalSessionParamsInput,
  body: WorkspaceTerminalSendBodyInput,
) {
  const actorUser = c.get("sessionUser");
  await c.get("services").workspace.sendWorkspaceTerminalInput({
    actorUserId: actorUser.id,
    data: body.input,
    organizationId: params.orgId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
  });

  return c.json({ ok: true });
}

export async function readWorkspaceTerminalOutputHandler(c: AppContext, params: WorkspaceTerminalSessionParamsInput) {
  const actorUser = c.get("sessionUser");
  const output = await c.get("services").workspace.readWorkspaceTerminalOutput({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
  });

  return c.json({ output });
}

export async function resizeWorkspaceTerminalHandler(
  c: AppContext,
  params: WorkspaceTerminalSessionParamsInput,
  body: WorkspaceTerminalResizeBodyInput,
) {
  const actorUser = c.get("sessionUser");
  await c.get("services").workspace.resizeWorkspaceTerminal({
    actorUserId: actorUser.id,
    cols: body.cols,
    organizationId: params.orgId,
    projectId: params.projectId,
    rows: body.rows,
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
  });

  return c.json({ ok: true });
}

export async function stopWorkspaceTerminalHandler(c: AppContext, params: WorkspaceTerminalSessionParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").workspace.stopWorkspaceTerminal({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
  });

  return c.json({ ok: true });
}
