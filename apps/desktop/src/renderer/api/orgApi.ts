import { requestJson } from "./restClient";
import type {
  AddOrganizationMemberResponse,
  OrganizationInviteRecord,
  OrganizationMemberRecord,
  OrganizationRecord,
} from "./types";

/** Lists organizations visible to the signed-in user. */
export async function listOrganizations(): Promise<OrganizationRecord[]> {
  const response = await requestJson<{ organizations: OrganizationRecord[] }>("/orgs");
  return response.organizations;
}

/** Creates one organization. */
export async function createOrganization(name: string): Promise<OrganizationRecord> {
  const response = await requestJson<{ organization: OrganizationRecord }>("/orgs", {
    method: "POST",
    body: { name },
  });

  return response.organization;
}

/** Lists members for one organization visible to the signed-in user. */
export async function listOrganizationMembers(orgId: string): Promise<OrganizationMemberRecord[]> {
  const response = await requestJson<{ members: OrganizationMemberRecord[] }>(`/orgs/${orgId}/members`);
  return response.members;
}

/**
 * Adds a member by email. If the email has no account yet, an invitation is
 * sent and the response carries `invited: true`.
 */
export async function addOrganizationMember(
  orgId: string,
  email: string,
  role: "member" | "admin" = "member",
): Promise<AddOrganizationMemberResponse> {
  return requestJson<AddOrganizationMemberResponse>(`/orgs/${orgId}/members`, {
    method: "POST",
    body: { email, role },
  });
}

/** Removes a member from one organization. */
export async function removeOrganizationMember(orgId: string, userId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" });
}

/** Lists pending (un-accepted) invitations for one organization. */
export async function listOrganizationInvites(orgId: string): Promise<OrganizationInviteRecord[]> {
  const response = await requestJson<{ invites: OrganizationInviteRecord[] }>(`/orgs/${orgId}/invites`);
  return response.invites;
}

/** Cancels a pending invitation. */
export async function cancelOrganizationInvite(orgId: string, inviteId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/orgs/${orgId}/invites/${inviteId}`, { method: "DELETE" });
}
