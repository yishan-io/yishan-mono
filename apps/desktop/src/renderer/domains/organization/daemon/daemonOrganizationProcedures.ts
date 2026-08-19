import { request } from "@renderer/rpc";

/**
 * Organization procedure adapters (desktop7 Phase 26). The organization
 * Domain owns its daemon-context procedures over the root transport's
 * path-based invoke. These wrappers are the only organization code that
 * touches transport.
 */

/** Tells the daemon which organization is active (CLI + MCP context). */
export async function setCurrentOrganization(orgId: string): Promise<unknown> {
  return request("context.setCurrentOrg", { orgId });
}
