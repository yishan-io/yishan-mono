import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { readRelayWorkspaceFile } from "@/features/workspaces/workspaces.relay";
import { queryKeys } from "@/lib/query/query-keys";
import {
  hasWorkspaceQueryPath,
  isRelayWorkspaceQueryEnabled,
  requireWorkspaceQueryAccessToken,
} from "./workspace-query-runtime";

export function useWorkspaceFileQuery(
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
  const normalizedNodeId = nodeId?.trim() ?? "";

  return useQuery({
    queryKey: queryKeys.workspaceFile(organizationId, projectId, workspaceId, normalizedNodeId, path, maxChars),
    queryFn: async () => {
      return readRelayWorkspaceFile({
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
