import { api } from "../api";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

/** Updates one organization node scope in the selected organization. */
export async function updateNodeScope(nodeId: string, scope: "private" | "shared") {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    return await api.node.updateScope(orgId, nodeId, scope);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/** Unregisters one organization node in the selected organization. */
export async function unregisterNode(nodeId: string): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    await api.node.unregister(orgId, nodeId);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
