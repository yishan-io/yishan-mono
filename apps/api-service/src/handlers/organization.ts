import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type {
  AddOrganizationMemberBodyInput,
  CancelOrganizationInviteParamsInput,
  CreateOrganizationBodyInput,
  OrganizationParamsInput,
  RemoveOrganizationMemberParamsInput,
} from "@/validation/organization";

export async function createOrganizationHandler(c: AppContext, body: CreateOrganizationBodyInput) {
  const { name, memberUserIds } = body;

  const actorUser = c.get("sessionUser");
  const organizationService = c.get("services").organization;

  const organization = await organizationService.createOrganization({
    name,
    actorUserId: actorUser.id,
    memberUserIds,
  });

  return c.json({ organization }, StatusCodes.CREATED);
}

export async function listOrganizationsHandler(c: AppContext) {
  const actorUser = c.get("sessionUser");
  const organizations = await c.get("services").organization.getOrganizationsForUser(actorUser.id);
  return c.json({ organizations });
}

export async function listOrganizationMembersHandler(c: AppContext, params: OrganizationParamsInput) {
  const actorUser = c.get("sessionUser");
  const members = await c.get("services").organization.listOrganizationMembers({
    organizationId: params.orgId,
    actorUserId: actorUser.id,
  });
  return c.json({ members });
}

export async function deleteOrganizationHandler(c: AppContext, params: OrganizationParamsInput) {
  const { orgId: organizationId } = params;

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.deleteOrganization({
    organizationId,
    actorUserId: actorUser.id,
  });

  return c.json({ ok: true });
}

export async function addOrganizationMemberHandler(
  c: AppContext,
  params: OrganizationParamsInput,
  body: AddOrganizationMemberBodyInput,
) {
  const { orgId: organizationId } = params;
  const { email, role } = body;

  const actorUser = c.get("sessionUser");
  const result = await c.get("services").organization.addOrganizationMember({
    organizationId,
    actorUserId: actorUser.id,
    memberEmail: email,
    role,
  });

  if (result.kind === "invited") {
    return c.json({ invited: true, invite: result.invite }, StatusCodes.CREATED);
  }

  return c.json({ invited: false, member: result.member }, StatusCodes.CREATED);
}

export async function removeOrganizationMemberHandler(c: AppContext, params: RemoveOrganizationMemberParamsInput) {
  const { orgId: organizationId, userId: memberUserId } = params;

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.removeOrganizationMember({
    organizationId,
    actorUserId: actorUser.id,
    memberUserId,
  });

  return c.json({ ok: true });
}

export async function listOrganizationInvitesHandler(c: AppContext, params: OrganizationParamsInput) {
  const invites = await c.get("services").organizationInvite.listPendingInvites(params.orgId);
  return c.json({ invites });
}

export async function cancelOrganizationInviteHandler(c: AppContext, params: CancelOrganizationInviteParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").organizationInvite.cancelInvite({
    organizationId: params.orgId,
    inviteId: params.inviteId,
    actorUserId: actorUser.id,
  });
  return c.json({ ok: true });
}

export async function leaveOrganizationHandler(c: AppContext, params: OrganizationParamsInput) {
  const { orgId: organizationId } = params;

  const actorUser = c.get("sessionUser");
  await c.get("services").organization.leaveOrganization({
    organizationId,
    actorUserId: actorUser.id,
  });

  return c.json({ ok: true });
}
