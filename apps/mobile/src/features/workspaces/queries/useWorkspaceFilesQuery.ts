import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listRelayWorkspaceFiles } from "@/features/workspaces/workspaces.relay";
import { queryKeys } from "@/lib/query/query-keys";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "./workspace-browser-query.constants";
import { isRelayWorkspaceQueryEnabled, requireWorkspaceQueryAccessToken } from "./workspace-query-runtime";

export function useWorkspaceFilesQuery(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    enabled?: boolean;
    nodeId?: string | null;
    path?: string;
    recursive?: boolean;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const nodeId = options?.nodeId ?? null;
  const normalizedNodeId = nodeId?.trim() ?? "";
  const path = options?.path ?? "";
  const recursive = options?.recursive ?? false;

  return useQuery({
    queryKey: queryKeys.workspaceFiles(organizationId, projectId, workspaceId, normalizedNodeId, path, recursive),
    queryFn: async () => {
      return listRelayWorkspaceFiles({
        accessToken: requireWorkspaceQueryAccessToken(accessToken),
        nodeId,
        path,
        recursive,
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
