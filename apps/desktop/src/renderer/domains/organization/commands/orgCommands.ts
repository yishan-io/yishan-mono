import { closeOverlayPanel } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";

import { sessionStore } from "@renderer/domains/session";
import { rendererQueryClient } from "../../../queryClient";
import {
  addOrganizationMember,
  cancelOrganizationInvite,
  createOrganization as createOrganizationFromApi,
  leaveOrganization as leaveOrganizationFromApi,
  listOrganizationInvites as listOrganizationInvitesFromApi,
  listOrganizationMembers as listOrganizationMembersFromApi,
  listOrganizations as listOrganizationsFromApi,
  removeOrganizationMember as removeOrganizationMemberFromApi,
} from "../api/orgApi";
import { setCurrentOrganization } from "../daemon/daemonOrganizationProcedures";

const errNoOrgSelected = "No organization selected.";

function resolveOrgId(): string {
  const orgId = sessionStore.getState().selectedOrganizationId;
  if (!orgId) {
    throw new Error(errNoOrgSelected);
  }
  return orgId;
}

function wrapOrgCommand<T>(fn: (orgId: string) => Promise<T>): Promise<T> {
  return fn(resolveOrgId()).catch((error) => {
    throw new Error(getErrorMessage(error));
  });
}

/**
 * Switches the current organization in both the session store and the daemon
 * context, so the CLI and MCP server know which org is active.
 */
export async function switchOrganization(orgId: string): Promise<void> {
  closeOverlayPanel();
  sessionStore.getState().setSelectedOrganizationId(orgId);

  try {
    await setCurrentOrganization(orgId);
  } catch {
    // Best-effort: daemon may not be available.
  }

  await rendererQueryClient.invalidateQueries({ queryKey: ["org-nodes", orgId] });
}

/**
 * Adds a member to the currently selected organization by their email address.
 * Returns `{ invited: true }` when the email has no account yet and an
 * invitation was sent, or `{ invited: false }` when the user was added directly.
 *
 * Throws with a human-readable message when the selected org is missing,
 * when the caller lacks permission, or when a pending invite already exists.
 */
export async function addOrgMember(email: string, role: "member" | "admin" = "member"): Promise<{ invited: boolean }> {
  return wrapOrgCommand(async (orgId) => {
    const result = await addOrganizationMember(orgId, email, role);
    return { invited: result.invited };
  });
}

/**
 * Cancels a pending organization invitation.
 * Throws with a human-readable message on failure.
 */
export async function cancelOrgInvite(inviteId: string): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await cancelOrganizationInvite(orgId, inviteId);
  });
}

/**
 * Removes a member from the currently selected organization.
 * Throws with a human-readable message on failure.
 */
export async function removeOrgMember(memberUserId: string): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await removeOrganizationMemberFromApi(orgId, memberUserId);
  });
}

/**
 * Leaves the currently selected organization as the signed-in user.
 * Throws with a human-readable message when the user is the last owner and
 * other members still exist.
 */
export async function leaveOrg(): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await leaveOrganizationFromApi(orgId);
  });
}

/** Creates one organization. */
export async function createOrganization(name: string) {
  return createOrganizationFromApi(name);
}

/** Lists all organizations for the current user. */
export async function listOrganizations() {
  return listOrganizationsFromApi();
}

/** Lists members for one organization. */
export async function listOrganizationMembers(orgId: string) {
  return listOrganizationMembersFromApi(orgId);
}

/** Lists pending invites for one organization. */
export async function listPendingInvites(orgId: string) {
  return listOrganizationInvitesFromApi(orgId);
}
