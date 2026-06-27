import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "@/features/auth";
import { sortFileBrowserEntries } from "@/features/workspaces/file-browser";
import { useWorkspaceFilesQuery } from "@/features/workspaces/queries/useWorkspaceFilesQuery";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "@/features/workspaces/queries/workspace-browser-query.constants";
import {
  isRelayWorkspaceQueryEnabled,
  requireWorkspaceQueryAccessToken,
} from "@/features/workspaces/queries/workspace-query-runtime";
import { listRelayWorkspaceFiles } from "@/features/workspaces/workspaces.relay";
import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";
import { queryKeys } from "@/lib/query/query-keys";

type UseWorkspaceDirectoryQueriesOptions = {
  expandedDirectoryPaths: string[];
  nodeId: string | null;
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export function useWorkspaceDirectoryQueries({
  expandedDirectoryPaths,
  nodeId,
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspaceDirectoryQueriesOptions) {
  const { status, session } = useAuth();
  const accessToken = session?.accessToken;

  const rootQuery = useWorkspaceFilesQuery(organizationId, projectId, workspaceId, {
    enabled: organizationId.length > 0 && projectId.length > 0 && workspaceId.length > 0,
    nodeId,
    path: "",
    recursive: false,
  });

  const childQueries = useQueries({
    queries: expandedDirectoryPaths.map((path) => ({
      enabled: isRelayWorkspaceQueryEnabled({
        accessToken,
        enabled: true,
        nodeId,
        organizationId,
        projectId,
        status,
        workspaceId,
      }),
      queryFn: async () => {
        return listRelayWorkspaceFiles({
          accessToken: requireWorkspaceQueryAccessToken(accessToken),
          nodeId,
          path,
          recursive: false,
          workspaceId,
        });
      },
      queryKey: queryKeys.workspaceFiles(organizationId, projectId, workspaceId, nodeId?.trim() ?? "", path, false),
      staleTime: WORKSPACE_BROWSER_QUERY_STALE_TIME_MS,
    })),
  });

  const childEntriesByPath = useMemo(() => {
    const entriesByPath = new Map<string, WorkspaceFileEntry[]>();

    expandedDirectoryPaths.forEach((path, index) => {
      const query = childQueries[index];
      if (query?.data) {
        entriesByPath.set(path, sortFileBrowserEntries(query.data));
      }
    });

    return entriesByPath;
  }, [childQueries, expandedDirectoryPaths]);

  const childQueryByPath = useMemo(() => {
    const queriesByPath = new Map<string, (typeof childQueries)[number]>();

    expandedDirectoryPaths.forEach((path, index) => {
      const query = childQueries[index];
      if (query) {
        queriesByPath.set(path, query);
      }
    });

    return queriesByPath;
  }, [childQueries, expandedDirectoryPaths]);

  return {
    childEntriesByPath,
    childQueryByPath,
    rootQuery,
  };
}
