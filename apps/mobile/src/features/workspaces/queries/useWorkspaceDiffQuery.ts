import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { readRelayWorkspaceDiff } from "@/features/workspaces/workspaces.relay";
import { queryKeys } from "@/lib/query/query-keys";
import {
  hasWorkspaceQueryPath,
  isRelayWorkspaceQueryEnabled,
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
    nodeId?: string | null;
  },
) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const maxChars = options?.maxChars ?? 0;
  const nodeId = options?.nodeId ?? null;

  return useQuery({
    queryKey: queryKeys.workspaceDiff(organizationId, projectId, workspaceId, path, maxChars),
    queryFn: async () => {
      return readRelayWorkspaceDiff({
        accessToken: requireWorkspaceQueryAccessToken(accessToken),
        maxChars: maxChars > 0 ? maxChars : undefined,
        nodeId,
        workspaceId,
        path,
      });
    },
    enabled:
      isRelayWorkspaceQueryEnabled({
        accessToken,
        enabled,
        nodeId,
        organizationId,
        projectId,
        status,
        workspaceId,
      }) && hasWorkspaceQueryPath(path),
  });
}
