import { closeOverlayPanel } from "@renderer/domains/workbench";

import { sessionStore } from "@renderer/domains/session";
import {
  createOrganization as createOrganizationFromApi,
  listOrganizations as listOrganizationsFromApi,
} from "../api/orgApi";
import { setCurrentOrganization } from "../daemon/daemonOrganizationProcedures";

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
}

/** Creates one organization. */
export async function createOrganization(name: string) {
  return createOrganizationFromApi(name);
}

/** Lists all organizations for the current user. */
export async function listOrganizations() {
  return listOrganizationsFromApi();
}
