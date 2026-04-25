import { requestJson } from "./restClient";
import type { NodeRecord } from "./types";

/** Lists nodes available to one organization member. */
export async function listOrganizationNodes(orgId: string): Promise<NodeRecord[]> {
  const response = await requestJson<{ nodes: NodeRecord[] }>(`/orgs/${orgId}/nodes`);
  return response.nodes;
}
