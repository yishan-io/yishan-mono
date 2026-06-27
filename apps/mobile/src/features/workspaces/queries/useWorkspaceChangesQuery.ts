import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listRelayWorkspaceGitChanges } from "@/features/workspaces/workspaces.relay";
import { queryKeys } from "@/lib/query/query-keys";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "./workspace-browser-query.constants";
import { isRelayWorkspaceQueryEnabled, requireWorkspaceQueryAccessToken } from "./workspace-query-runtime";

export function useWorkspaceChangesQuery(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    enabled?: boolean;
    nodeId?: string | null;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const nodeId = options?.nodeId ?? null;

  return useQuery({
    queryKey: queryKeys.workspaceChanges(organizationId, projectId, workspaceId),
    queryFn: async () => {
      return listRelayWorkspaceGitChanges({
        accessToken: requireWorkspaceQueryAccessToken(accessToken),
        nodeId,
        workspaceId,
      });
    },
    enabled: isRelayWorkspaceQueryEnabled({
      accessToken,
      enabled,
      nodeId,
      organizationId,
      projectId,
      status,
      workspaceId,
    }),
    staleTime: WORKSPACE_BROWSER_QUERY_STALE_TIME_MS,
  });
}
