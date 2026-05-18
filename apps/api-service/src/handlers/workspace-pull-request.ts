import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type { UpsertWorkspacePullRequestBodyInput, WorkspacePullRequestParamsInput } from "@/validation/project";

export async function listWorkspacePullRequestsHandler(c: AppContext, params: WorkspacePullRequestParamsInput) {
  const actorUser = c.get("sessionUser");
  const pullRequests = await c.get("services").workspacePullRequest.listWorkspacePullRequests({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    workspaceId: params.workspaceId,
  });

  return c.json({ pullRequests });
}

export async function upsertWorkspacePullRequestHandler(
  c: AppContext,
  params: WorkspacePullRequestParamsInput,
  body: UpsertWorkspacePullRequestBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const pullRequest = await c.get("services").workspacePullRequest.upsertWorkspacePullRequest({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    workspaceId: params.workspaceId,
    prId: body.prId,
    title: body.title,
    url: body.url,
    branch: body.branch,
    baseBranch: body.baseBranch,
    state: body.state,
    metadata: body.metadata,
    detectedAt: new Date(body.detectedAt),
    resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : undefined,
  });

  // PUT is idempotent; we return 200 for both create and update since the
  // client cannot distinguish them and the resource is always fully specified.
  return c.json({ pullRequest }, StatusCodes.OK);
}
