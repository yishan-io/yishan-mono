import { useQueries } from "@tanstack/react-query";
import { sortFileBrowserEntries } from "@yishan/file-browser-core";
import { useMemo } from "react";

import { useAuth } from "@/features/auth";
import { useWorkspaceFilesQuery } from "@/features/workspaces/queries/useWorkspaceFilesQuery";
import { WORKSPACE_BROWSER_QUERY_STALE_TIME_MS } from "@/features/workspaces/queries/workspace-browser-query.constants";
import {
  isWorkspaceQueryEnabled,
  requireWorkspaceQueryAccessToken,
} from "@/features/workspaces/queries/workspace-query-runtime";
import { listWorkspaceFiles } from "@/features/workspaces/workspaces.api";
import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";
import { queryKeys } from "@/lib/query/query-keys";

type UseWorkspaceDirectoryQueriesOptions = {
  expandedDirectoryPaths: string[];
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export function useWorkspaceDirectoryQueries({
  expandedDirectoryPaths,
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspaceDirectoryQueriesOptions) {
  const { status, session } = useAuth();
  const accessToken = session?.accessToken;

  const rootQuery = useWorkspaceFilesQuery(organizationId, projectId, workspaceId, {
    enabled: organizationId.length > 0 && projectId.length > 0 && workspaceId.length > 0,
    path: "",
    recursive: false,
  });

  const childQueries = useQueries({
    queries: expandedDirectoryPaths.map((path) => ({
      enabled: isWorkspaceQueryEnabled({
        accessToken,
        enabled: true,
        organizationId,
        projectId,
        status,
        workspaceId,
      }),
      queryFn: async () => {
        return listWorkspaceFiles(
          requireWorkspaceQueryAccessToken(accessToken),
          organizationId,
          projectId,
          workspaceId,
          {
            path,
            recursive: false,
          },
        );
      },
      queryKey: queryKeys.workspaceFiles(organizationId, projectId, workspaceId, path, false),
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
