import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  AddOrganizationMemberBodyInput,
  CreateOrganizationBodyInput,
  OrganizationParamsInput,
  RemoveOrganizationMemberParamsInput
} from "@/validation/organization";

export async function createOrganizationHandler(c: AppContext, body: CreateOrganizationBodyInput) {
  const { name, memberUserIds } = body;

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

export async function deleteOrganizationHandler(c: AppContext, params: OrganizationParamsInput) {
  const { orgId: organizationId } = params;

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.deleteOrganization({
    organizationId,
    actorUserId: actorUser.id
  });

  return c.json({ ok: true });
}

export async function addOrganizationMemberHandler(
  c: AppContext,
  params: OrganizationParamsInput,
  body: AddOrganizationMemberBodyInput
) {
  const { orgId: organizationId } = params;
  const { userId, role } = body;

  const actorUser = c.get("sessionUser");
  const member = await c.get("services").organization.addOrganizationMember({
    organizationId,
    actorUserId: actorUser.id,
    memberUserId: userId,
    role
  });

  return c.json({ member }, StatusCodes.CREATED);
}

export async function removeOrganizationMemberHandler(
  c: AppContext,
  params: RemoveOrganizationMemberParamsInput
) {
  const { orgId: organizationId, userId: memberUserId } = params;

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.removeOrganizationMember({
    organizationId,
    actorUserId: actorUser.id,
    memberUserId
  });

  return c.json({ ok: true });
}
