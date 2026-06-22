import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listWorkspaceFiles } from "@/features/workspaces/workspaces.api";
import { queryKeys } from "@/lib/query/query-keys";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "./workspace-browser-query.constants";
import { isWorkspaceQueryEnabled, requireWorkspaceQueryAccessToken } from "./workspace-query-runtime";

export function useWorkspaceFilesQuery(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  options?: {
    enabled?: boolean;
    path?: string;
    recursive?: boolean;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const path = options?.path ?? "";
  const recursive = options?.recursive ?? false;

  return useQuery({
    queryKey: queryKeys.workspaceFiles(organizationId, projectId, workspaceId, path, recursive),
    queryFn: async () => {
      return listWorkspaceFiles(requireWorkspaceQueryAccessToken(accessToken), organizationId, projectId, workspaceId, {
        path,
        recursive,
      });
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
