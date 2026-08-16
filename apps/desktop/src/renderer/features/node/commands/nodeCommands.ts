import { api } from "../../../api";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { selectSelectedOrganizationId } from "../../../features/session/model/sessionSelectors";

const errNoOrgSelected = "No organization selected.";

function resolveOrgId(): string {
  const orgId = selectSelectedOrganizationId();
  if (!orgId) {
    throw new Error(errNoOrgSelected);
  }
  return orgId;
}

function wrapNodeCommand<T>(fn: (orgId: string) => Promise<T>): Promise<T> {
  return fn(resolveOrgId()).catch((error) => {
    throw new Error(getErrorMessage(error));
  });
}

/** Updates one organization node scope in the selected organization. */
export function updateNodeScope(nodeId: string, scope: "private" | "shared") {
  return wrapNodeCommand((orgId) => api.node.updateScope(orgId, nodeId, scope));
}

/** Unregisters one organization node in the selected organization. */
export function unregisterNode(nodeId: string): Promise<void> {
  return wrapNodeCommand((orgId) => api.node.unregister(orgId, nodeId));
}

/** Lists all nodes for the given organization (project-tree node hierarchy). */
export async function listOrgNodes(organizationId: string) {
  return api.node.listByOrg(organizationId);
}
