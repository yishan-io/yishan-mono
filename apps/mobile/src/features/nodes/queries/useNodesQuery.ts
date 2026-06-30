import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { queryKeys } from "@/lib/query/query-keys";
import { listNodes } from "../nodes.api";

export function useNodesQuery(organizationId: string, options?: { enabled?: boolean }) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.nodes(organizationId),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      return listNodes(accessToken, organizationId);
    },
    enabled: enabled && status === "authenticated" && !!accessToken && organizationId.length > 0,
  });
}
