import { api } from "../api";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { workspaceUiStore } from "../store/workspaceUiStore";

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
  workspaceUiStore.getState().closeOverlayPanel();
  sessionStore.getState().setSelectedOrganizationId(orgId);

  try {
    const client = await getDaemonClient();
    await client.context.setCurrentOrg(orgId);
  } catch {
    // Best-effort: daemon may not be available.
  }
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
    const result = await api.org.addMember(orgId, email, role);
    return { invited: result.invited };
  });
}

/**
 * Cancels a pending organization invitation.
 * Throws with a human-readable message on failure.
 */
export async function cancelOrgInvite(inviteId: string): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await api.org.cancelInvite(orgId, inviteId);
  });
}

/**
 * Removes a member from the currently selected organization.
 * Throws with a human-readable message on failure.
 */
export async function removeOrgMember(memberUserId: string): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await api.org.removeMember(orgId, memberUserId);
  });
}

/**
 * Leaves the currently selected organization as the signed-in user.
 * Throws with a human-readable message when the user is the last owner and
 * other members still exist.
 */
export async function leaveOrg(): Promise<void> {
  return wrapOrgCommand(async (orgId) => {
    await api.org.leave(orgId);
  });
}
