import { useCallback, useMemo } from "react";

import { buildAncestorPaths, sortFileBrowserEntries } from "@/features/workspaces/file-browser";
import type { WorkspaceFileEntry } from "@/features/workspaces/workspaces.types";
import { useWorkspaceDirectoryQueries } from "./useWorkspaceDirectoryQueries";
import { useWorkspaceEntryMenu } from "./useWorkspaceEntryMenu";
import { useWorkspaceExpandedPathsState } from "./useWorkspaceExpandedPathsState";

type UseWorkspaceFileTreeOptions = {
  activeDirectoryPath: string;
  browserStateId: string;
  nodeId: string | null;
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceFileTreeRow = {
  depth: number;
  entry: WorkspaceFileEntry;
  hasError: boolean;
  isExpanded: boolean;
  isLoadingChildren: boolean;
};

function createInitialExpandedPaths(activeDirectoryPath: string) {
  return new Set(buildAncestorPaths(activeDirectoryPath));
}

export function useWorkspaceFileTree({
  activeDirectoryPath,
  browserStateId,
  nodeId,
  organizationId,
  projectId,
  workspaceId,
}: UseWorkspaceFileTreeOptions) {
  const { expandedPaths, normalizeExpandedPaths, setExpandedPaths } = useWorkspaceExpandedPathsState({
    activeDirectoryPath,
    browserStateId,
  });
  const { closeMenu, copyMenuEntryPath, menuEntry, openMenu } = useWorkspaceEntryMenu();

  const expandedDirectoryPaths = useMemo(() => [...expandedPaths].sort(), [expandedPaths]);
  const { childEntriesByPath, childQueryByPath, rootQuery } = useWorkspaceDirectoryQueries({
    expandedDirectoryPaths,
    nodeId,
    organizationId,
    projectId,
    workspaceId,
  });

  const rows = useMemo(() => {
    const flattenedRows: WorkspaceFileTreeRow[] = [];
    const rootEntries = sortFileBrowserEntries(rootQuery.data ?? []);

    const appendRows = (entries: readonly WorkspaceFileEntry[], depth: number) => {
      for (const entry of entries) {
        const query = childQueryByPath.get(entry.path);
        const isExpanded = entry.isDir && expandedPaths.has(entry.path);

        flattenedRows.push({
          depth,
          entry,
          hasError: entry.isDir ? Boolean(query?.isError) : false,
          isExpanded,
          isLoadingChildren: entry.isDir ? Boolean(query?.isLoading || query?.isFetching) : false,
        });

        if (isExpanded) {
          appendRows(childEntriesByPath.get(entry.path) ?? [], depth + 1);
        }
      }
    };

    appendRows(rootEntries, 0);
    return flattenedRows;
  }, [childEntriesByPath, childQueryByPath, expandedPaths, rootQuery.data]);

  const toggleDirectory = useCallback(
    (path: string) => {
      const query = childQueryByPath.get(path);
      if (query?.isError) {
        void query.refetch();
        return;
      }

      setExpandedPaths((current) => {
        const next = new Set(current);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }

        return normalizeExpandedPaths(next);
      });
    },
    [childQueryByPath, normalizeExpandedPaths, setExpandedPaths],
  );

  return {
    closeMenu,
    copyMenuEntryPath,
    menuEntry,
    openMenu,
    rootQuery,
    rows,
    toggleDirectory,
  };
}
