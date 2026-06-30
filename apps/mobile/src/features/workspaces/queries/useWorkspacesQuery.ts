import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listWorkspaces } from "@/features/workspaces/workspaces.api";
import { queryKeys } from "@/lib/query/query-keys";
import { isWorkspaceQueryEnabled, requireWorkspaceQueryAccessToken } from "./workspace-query-runtime";

export function useWorkspacesQuery(organizationId: string, projectId: string, options?: { enabled?: boolean }) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: queryKeys.workspaces(organizationId, projectId),
    queryFn: async () => {
      return listWorkspaces(requireWorkspaceQueryAccessToken(accessToken), organizationId, projectId);
    },
    enabled: isWorkspaceQueryEnabled({
      accessToken,
      enabled,
      organizationId,
      projectId,
      status,
    }),
  });
}
