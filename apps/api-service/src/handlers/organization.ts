import { StatusCodes } from "http-status-codes";

import type { AppContext } from "../hono";

type CreateOrganizationBody = {
  name?: string;
  memberUserIds?: string[];
};

function parseMemberUserIds(raw: unknown): string[] | null {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const values: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    values.push(trimmed);
  }

  return values;
}

export async function createOrganizationHandler(c: AppContext) {
  let body: CreateOrganizationBody;

  try {
    body = await c.req.json<CreateOrganizationBody>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, StatusCodes.BAD_REQUEST);
  }

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: "name is required" }, StatusCodes.BAD_REQUEST);
  }

  const memberUserIds = parseMemberUserIds(body.memberUserIds);
  if (memberUserIds === null) {
    return c.json(
      { error: "memberUserIds must be an array of non-empty strings" },
      StatusCodes.BAD_REQUEST
    );
  }

  const actorUser = c.get("sessionUser");
  const organizationService = c.get("services").organization;

  const organization = await organizationService.createOrganization({
    name,
    actorUserId: actorUser.id,
    memberUserIds
  });

  return c.json({ organization }, StatusCodes.CREATED);
}

export async function listOrganizationsHandler(c: AppContext) {
  const user = c.get("sessionUser");
  const organizations = await c.get("services").organization.getOrganizationsForUser(user.id);
  return c.json({ organizations });
}

export async function deleteOrganizationHandler(c: AppContext) {
  const organizationId = c.req.param("orgId")?.trim();
  if (!organizationId) {
    return c.json({ error: "orgId is required" }, StatusCodes.BAD_REQUEST);
  }

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.deleteOrganization({
    organizationId,
    actorUserId: actorUser.id
  });

  return c.json({ ok: true });
}
