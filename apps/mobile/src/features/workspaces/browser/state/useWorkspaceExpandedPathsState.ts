import { useEffect, useState } from "react";

import { buildAncestorPaths } from "@/features/workspaces/file-browser";

const MAX_EXPANDED_DIRECTORIES = 24;
const expandedPathsCache = new Map<string, string[]>();

function createInitialExpandedPaths(activeDirectoryPath: string) {
  return new Set(buildAncestorPaths(activeDirectoryPath));
}

function normalizeExpandedPaths(paths: Iterable<string>, activeDirectoryPath: string) {
  const requiredPaths = new Set(buildAncestorPaths(activeDirectoryPath));
  const uniquePaths = [...new Set(paths)];
  const optionalPaths = uniquePaths.filter((path) => !requiredPaths.has(path));
  const remainingCapacity = Math.max(0, MAX_EXPANDED_DIRECTORIES - requiredPaths.size);
  const trimmedOptionalPaths = optionalPaths.slice(-remainingCapacity);

  return new Set([...requiredPaths, ...trimmedOptionalPaths]);
}

type UseWorkspaceExpandedPathsStateOptions = {
  activeDirectoryPath: string;
  browserStateId: string;
};

export function useWorkspaceExpandedPathsState({
  activeDirectoryPath,
  browserStateId,
}: UseWorkspaceExpandedPathsStateOptions) {
  const [expandedPaths, setExpandedPaths] = useState(() =>
    normalizeExpandedPaths(browserStateId ? (expandedPathsCache.get(browserStateId) ?? []) : [], activeDirectoryPath),
  );

  useEffect(() => {
    setExpandedPaths(
      normalizeExpandedPaths(browserStateId ? (expandedPathsCache.get(browserStateId) ?? []) : [], activeDirectoryPath),
    );
  }, [activeDirectoryPath, browserStateId]);

  useEffect(() => {
    if (!browserStateId) {
      setExpandedPaths(createInitialExpandedPaths(activeDirectoryPath));
      return;
    }
  }, [activeDirectoryPath, browserStateId]);

  useEffect(() => {
    if (!browserStateId) {
      return;
    }

    const paths = [...normalizeExpandedPaths(expandedPaths, activeDirectoryPath)];
    expandedPathsCache.set(browserStateId, paths);
  }, [activeDirectoryPath, browserStateId, expandedPaths]);

  return {
    expandedPaths,
    normalizeExpandedPaths: (paths: Iterable<string>) => normalizeExpandedPaths(paths, activeDirectoryPath),
    setExpandedPaths,
  };
}

export function clearCachedWorkspaceExpandedPaths(browserStateId: string) {
  if (!browserStateId) {
    return;
  }

  expandedPathsCache.delete(browserStateId);
}
