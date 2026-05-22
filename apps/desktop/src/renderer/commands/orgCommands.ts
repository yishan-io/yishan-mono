import { api } from "../api";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

/**
 * Adds a member to the currently selected organization by their email address.
 * Returns `{ invited: true }` when the email has no account yet and an
 * invitation was sent, or `{ invited: false }` when the user was added directly.
 *
 * Throws with a human-readable message when the selected org is missing,
 * when the caller lacks permission, or when a pending invite already exists.
 */
export async function addOrgMember(email: string, role: "member" | "admin" = "member"): Promise<{ invited: boolean }> {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    const result = await api.org.addMember(orgId, email, role);
    return { invited: result.invited };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Cancels a pending organization invitation.
 * Throws with a human-readable message on failure.
 */
export async function cancelOrgInvite(inviteId: string): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    await api.org.cancelInvite(orgId, inviteId);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Removes a member from the currently selected organization.
 * Throws with a human-readable message on failure.
 */
export async function removeOrgMember(memberUserId: string): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    await api.org.removeMember(orgId, memberUserId);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
