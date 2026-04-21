import type { Next } from "hono";
import { StatusCodes } from "http-status-codes";

import { OrganizationMembershipRequiredError } from "@/errors";
import type { AppContext } from "@/hono";

function readOrganizationIdFromParam(c: AppContext, paramName = "orgId"): string | null {
  const value = c.req.param(paramName);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOrganizationIdFromQuery(c: AppContext, queryKey = "organizationId"): string | null {
  const value = c.req.query(queryKey);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertOrganizationMembership(c: AppContext, organizationId: string): Promise<void> {
  const actorUser = c.get("sessionUser");
  const role = await c
    .get("services")
    .organization.getMembershipRole({ organizationId, userId: actorUser.id });

  if (!role) {
    throw new OrganizationMembershipRequiredError();
  }

  c.set("organizationId", organizationId);
  c.set("organizationRole", role);
}

export async function requireOrganizationMemberFromParam(c: AppContext, next: Next) {
  const organizationId = readOrganizationIdFromParam(c);
  if (!organizationId) {
    return c.json({ error: "orgId is required" }, StatusCodes.BAD_REQUEST);
  }

  await assertOrganizationMembership(c, organizationId);
  await next();
}

export async function requireOrganizationMemberFromQuery(c: AppContext, next: Next) {
  const organizationId = readOrganizationIdFromQuery(c);
  if (!organizationId) {
    await next();
    return;
  }

  await assertOrganizationMembership(c, organizationId);
  await next();
}
