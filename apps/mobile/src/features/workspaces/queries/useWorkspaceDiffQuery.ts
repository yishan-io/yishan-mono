import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { readWorkspaceDiff } from "@/features/workspaces/workspaces.api";
import { queryKeys } from "@/lib/query/query-keys";
import {
  hasWorkspaceQueryPath,
  isWorkspaceQueryEnabled,
  requireWorkspaceQueryAccessToken,
} from "./workspace-query-runtime";

export function useWorkspaceDiffQuery(
  organizationId: string,
  projectId: string,
  workspaceId: string,
  path: string,
  options?: {
    enabled?: boolean;
    maxChars?: number;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const maxChars = options?.maxChars ?? 0;

  return useQuery({
    queryKey: queryKeys.workspaceDiff(organizationId, projectId, workspaceId, path, maxChars),
    queryFn: async () => {
      return readWorkspaceDiff(
        requireWorkspaceQueryAccessToken(accessToken),
        organizationId,
        projectId,
        workspaceId,
        path,
        {
          maxChars: maxChars > 0 ? maxChars : undefined,
        },
      );
    },
    enabled:
      isWorkspaceQueryEnabled({
        accessToken,
        enabled,
        organizationId,
        projectId,
        status,
        workspaceId,
      }) && hasWorkspaceQueryPath(path),
  });
}
