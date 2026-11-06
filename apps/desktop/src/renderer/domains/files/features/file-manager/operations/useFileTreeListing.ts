import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { type WorkspaceItem, workspaceStore } from "@renderer/domains/workspace";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fileTreeStore } from "../../../state/fileTreeStore";
import type { WorkspaceFileEntry } from "../../../externalApps";
import { mapIgnoredWorkspaceEntryPaths, mapWorkspaceEntryPaths } from "../fileTreeEntries";
import { FileTreeRefreshCancelledError, FileTreeRefreshRuntime, type FileTreeSnapshot } from "./fileTreeRefreshRuntime";

const EMPTY_PATHS: string[] = [];
function getIdentity(workspace: WorkspaceItem | undefined) {
  return workspace?.worktreePath?.trim() ? JSON.stringify([
    workspace.id, workspace.worktreePath.trim(), workspace.nodeId, workspace.organizationId,
    workspace.projectId, workspace.createdAt,
  ]) : "";
}

/** Owns listing lifecycle and restores only accepted fresh identity-specific snapshots. */
export function useFileTreeListing() {
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const workspaces = workspaceStore((state) => state.workspaces);
  const workspace = workspaces.find((candidate) => candidate.id === selectedWorkspaceId);
  const selectedWorkspaceWorktreePath = workspace?.worktreePath?.trim() ?? "";
  const identity = getIdentity(workspace);
  const runtime = useMemo<{ current: FileTreeRefreshRuntime | null }>(() => ({ current: null }), [identity]);
  const isCurrentListing = useCallback(() => runtime.current !== null, [runtime]);
  const cache = useRef(new Map<string, FileTreeSnapshot>());
  const [visible, setVisible] = useState<{ identity: string; entries: WorkspaceFileEntry[] }>({ identity: "", entries: [] });

  useLayoutEffect(() => {
    if (!identity) {
      runtime.current = null;
      setVisible({ identity, entries: [] });
      return;
    }
    const listing = new FileTreeRefreshRuntime({ identity, workspaceId: selectedWorkspaceId ?? "",
      snapshot: cache.current.get(identity),
      expandedPaths: fileTreeStore.getState().expandedFileTreeItemsByWorkspaceId[selectedWorkspaceId ?? ""] ?? [],
      publish: (entries) => setVisible({ identity, entries }),
      cache: (snapshot) => { if (snapshot) cache.current.set(identity, snapshot); else cache.current.delete(identity); },
    });
    runtime.current = listing;
    setVisible({ identity, entries: listing.entries });
    const unsubscribe = fileTreeStore.subscribe((state, previous) => {
      const paths = state.fileTreeChangedRelativePathsByWorktreePath[selectedWorkspaceWorktreePath];
      if (state.fileTreeRefreshVersion !== previous.fileTreeRefreshVersion ||
        paths !== previous.fileTreeChangedRelativePathsByWorktreePath[selectedWorkspaceWorktreePath]) {
        // fire-and-forget: synchronously merge every event before React can batch renders.
        void listing.refresh(paths ?? EMPTY_PATHS);
      }
    });
    return () => { unsubscribe(); listing.dispose(); runtime.current = null; };
  }, [identity, selectedWorkspaceId, selectedWorkspaceWorktreePath, runtime]);

  useEffect(() => {
    const identities = new Set(workspaces.map(getIdentity));
    for (const key of cache.current.keys()) if (!identities.has(key)) cache.current.delete(key);
  }, [workspaces]);

  useEffect(() => {
    // fire-and-forget: runtime logs failures and handles the returned rejection.
    void runtime.current?.refresh(fileTreeStore.getState()
      .fileTreeChangedRelativePathsByWorktreePath[selectedWorkspaceWorktreePath] ?? EMPTY_PATHS);
  }, [identity, selectedWorkspaceWorktreePath, runtime]);

  const loadAllRepoFiles = useCallback(() => {
    const promise = (runtime.current?.refresh() ?? Promise.reject(new FileTreeRefreshCancelledError())).then(mapWorkspaceEntryPaths);
    // fire-and-forget callers are safe; awaiters still receive the failure.
    promise.catch(() => undefined);
    return promise;
  }, [runtime]);
  const refreshAllRepoFiles = useCallback(() => {
    const promise = loadAllRepoFiles().then(() => undefined);
    promise.catch(() => undefined);
    return promise;
  }, [loadAllRepoFiles]);
  const ensurePathLoaded = useCallback((path: string) => {
    const promise = runtime.current?.ensurePathLoaded(path) ?? Promise.reject(new FileTreeRefreshCancelledError());
    // fire-and-forget callers are safe; runtime logs real errors, awaiters retain rejection.
    promise.catch(() => undefined);
    return promise;
  }, [runtime]);
  const repoEntries = visible.identity === identity ? visible.entries : [];
  const repoFiles = useMemo(() => mapWorkspaceEntryPaths(repoEntries), [repoEntries]);
  const ignoredRepoPaths = useMemo(() => mapIgnoredWorkspaceEntryPaths(repoEntries), [repoEntries]);
  return { selectedWorkspaceId, selectedWorkspaceWorktreePath, repoEntries, repoFiles, ignoredRepoPaths,
    loadAllRepoFiles, refreshAllRepoFiles, ensurePathLoaded, isCurrentListing };
}
