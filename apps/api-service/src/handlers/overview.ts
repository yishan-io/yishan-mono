import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  OverviewModelBreakdownQueryInput,
  OverviewOrgParamsInput,
  OverviewTokenUsageQueryInput,
} from "@/validation/overview";

export async function getOverviewTokenUsageHandler(
  c: AppContext,
  params: OverviewOrgParamsInput,
  query: OverviewTokenUsageQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const result = await c.get("services").overview.getTokenUsage({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
    range: query.range,
    projectId: query.projectId,
    granularity: query.granularity,
  });

  return c.json(result, StatusCodes.OK);
}

export async function getOverviewModelBreakdownHandler(
  c: AppContext,
  params: OverviewOrgParamsInput,
  query: OverviewModelBreakdownQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const result = await c.get("services").overview.getModelBreakdown({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
    range: query.range,
    projectId: query.projectId,
  });

  return c.json(result, StatusCodes.OK);
}

export async function getOverviewWorkspaceInsightsHandler(c: AppContext, params: OverviewOrgParamsInput) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const result = await c.get("services").overview.getWorkspaceInsights({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
  });

  return c.json(result, StatusCodes.OK);
}
