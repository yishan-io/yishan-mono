import { useEffect, useRef, useState } from "react";
import type { FileTreeGitChangeKind } from "../../../components/FileTree/types";

function normalizeGitChangeKind(kind: string): FileTreeGitChangeKind {
  if (kind === "added" || kind === "modified" || kind === "deleted" || kind === "renamed") {
    return kind;
  }

  return "modified";
}

function mergeGitChangeKinds(
  currentKind: FileTreeGitChangeKind | undefined,
  nextKind: FileTreeGitChangeKind,
): FileTreeGitChangeKind {
  if (!currentKind || currentKind === nextKind) {
    return nextKind;
  }

  if (currentKind === "deleted" || nextKind === "deleted") {
    return "deleted";
  }

  if (currentKind === "renamed" || nextKind === "renamed") {
    return "renamed";
  }

  if (currentKind === "added" || nextKind === "added") {
    return "added";
  }

  return "modified";
}

function normalizeGitChangePath(path: string): string {
  const trimmedPath = path.trim().replace(/\\/g, "/");
  if (!trimmedPath) {
    return "";
  }

  const braceRenameMatch = trimmedPath.match(/^(.*)\{[^{}]* => ([^{}]+)\}(.*)$/);
  let normalizedPath = braceRenameMatch
    ? `${braceRenameMatch[1] ?? ""}${braceRenameMatch[2] ?? ""}${braceRenameMatch[3] ?? ""}`
    : trimmedPath;

  if (normalizedPath.includes(" -> ")) {
    const renamedParts = normalizedPath.split(" -> ");
    normalizedPath = renamedParts[renamedParts.length - 1] ?? normalizedPath;
  } else if (normalizedPath.includes(" => ")) {
    const renamedParts = normalizedPath.split(" => ");
    normalizedPath = renamedParts[renamedParts.length - 1] ?? normalizedPath;
  }

  return normalizedPath.trim().replace(/^"+|"+$/g, "").replace(/^\/+|\/+$/g, "");
}

function areGitChangeMapsEqual(
  leftMap: Record<string, FileTreeGitChangeKind>,
  rightMap: Record<string, FileTreeGitChangeKind>,
): boolean {
  const leftKeys = Object.keys(leftMap);
  const rightKeys = Object.keys(rightMap);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (leftMap[key] !== rightMap[key]) {
      return false;
    }
  }

  return true;
}

type ListGitChanges = (input: {
  workspaceId: string;
}) => Promise<{
  staged: Array<{ path: string; kind: string }>;
  unstaged: Array<{ path: string; kind: string }>;
  untracked: Array<{ path: string; kind: string }>;
}>;

type UseFileTreeGitChangesInput = {
  listGitChanges: ListGitChanges;
  selectedWorkspaceId: string;
  selectedWorkspaceWorktreePath: string;
  workspaceGitRefreshVersion: number;
};

/** Keeps file-tree git change badges synchronized with workspace git status. */
export function useFileTreeGitChanges({
  listGitChanges,
  selectedWorkspaceId,
  selectedWorkspaceWorktreePath,
  workspaceGitRefreshVersion,
}: UseFileTreeGitChangesInput) {
  const [gitChangesByPath, setGitChangesByPath] = useState<Record<string, FileTreeGitChangeKind>>({});
  const gitChangeLoadRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = gitChangeLoadRequestIdRef.current + 1;
    gitChangeLoadRequestIdRef.current = requestId;

    if (!selectedWorkspaceWorktreePath || !selectedWorkspaceId) {
      setGitChangesByPath((currentMap) => (Object.keys(currentMap).length === 0 ? currentMap : {}));
      return;
    }

    void workspaceGitRefreshVersion;

    let cancelled = false;
    void (async () => {
      try {
        const sections = await listGitChanges({
          workspaceId: selectedWorkspaceId,
        });

        if (cancelled || gitChangeLoadRequestIdRef.current !== requestId) {
          return;
        }

        const nextMap: Record<string, FileTreeGitChangeKind> = {};
        for (const file of [...sections.unstaged, ...sections.staged, ...sections.untracked]) {
          const normalizedPath = normalizeGitChangePath(file.path);
          if (!normalizedPath || normalizedPath.endsWith("/")) {
            continue;
          }

          const nextKind = normalizeGitChangeKind(file.kind);
          nextMap[normalizedPath] = mergeGitChangeKinds(nextMap[normalizedPath], nextKind);
        }

        setGitChangesByPath((currentMap) => (areGitChangeMapsEqual(currentMap, nextMap) ? currentMap : nextMap));
      } catch (error) {
        console.error("Failed to load file-tree git changes", error);
        if (cancelled || gitChangeLoadRequestIdRef.current !== requestId) {
          return;
        }

        setGitChangesByPath((currentMap) => (Object.keys(currentMap).length === 0 ? currentMap : {}));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listGitChanges, selectedWorkspaceId, selectedWorkspaceWorktreePath, workspaceGitRefreshVersion]);

  return gitChangesByPath;
}
