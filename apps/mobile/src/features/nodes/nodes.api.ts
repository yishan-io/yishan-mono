import { apiRequest } from "@/lib/api/client";
import type { Node } from "./nodes.types";

export async function listNodes(accessToken: string, organizationId: string): Promise<Node[]> {
  const response = await apiRequest<{ nodes: Node[] }>(`/orgs/${organizationId}/nodes`, {
    accessToken,
  });

  return response.nodes;
}
