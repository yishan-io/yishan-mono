import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  TokenUsageHourlyQueryInput,
  TokenUsageOrgParamsInput,
  UpsertTokenUsageHourlyBodyInput,
} from "@/validation/token-usage";

export async function upsertTokenUsageHourlyHandler(
  c: AppContext,
  params: TokenUsageOrgParamsInput,
  body: UpsertTokenUsageHourlyBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const result = await c.get("services").tokenUsage.upsertHourly({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
    rows: body.rows,
  });

  return c.json(result, StatusCodes.OK);
}

export async function listTokenUsageHourlyHandler(
  c: AppContext,
  params: TokenUsageOrgParamsInput,
  query: TokenUsageHourlyQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const rows = await c.get("services").tokenUsage.listHourly({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
    projectId: query.projectId,
    workspaceId: query.workspaceId,
    agentKind: query.agentKind,
    from: query.from,
    to: query.to,
    limit: query.limit,
  });

  return c.json({ rows }, StatusCodes.OK);
}
