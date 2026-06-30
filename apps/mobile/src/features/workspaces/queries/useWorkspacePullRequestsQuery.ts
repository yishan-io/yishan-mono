import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listWorkspacePullRequests } from "@/features/workspaces/workspaces.api";
import { queryKeys } from "@/lib/query/query-keys";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "./workspace-browser-query.constants";
import { isWorkspaceQueryEnabled, requireWorkspaceQueryAccessToken } from "./workspace-query-runtime";

export function useWorkspacePullRequestsQuery(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    enabled?: boolean;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.workspacePullRequests(organizationId, projectId, workspaceId),
    queryFn: async () => {
      return listWorkspacePullRequests(
        requireWorkspaceQueryAccessToken(accessToken),
        organizationId,
        projectId,
        workspaceId,
      );
    },
    enabled: isWorkspaceQueryEnabled({
      accessToken,
      enabled,
      organizationId,
      projectId,
      status,
      workspaceId,
    }),
    staleTime: WORKSPACE_BROWSER_QUERY_STALE_TIME_MS,
  });
}
