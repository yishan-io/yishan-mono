import { useEffect, useRef } from "react";
import { createAllWorkspacesGitSyncRuntime } from "../../runtime/allWorkspacesGitSyncRuntime";

/**
 * Subscribes to git refresh version changes for ALL workspaces and triggers
 * `refreshWorkspaceGitChanges` for each affected workspace, including those
 * that are not currently selected (Phase 13, desktop5.md).
 *
 * The refresh state map, version tracking, and store subscription live in the
 * Workspace runtime (`allWorkspacesGitSyncRuntime.ts`); this hook only mounts
 * the runtime for the lifetime of the consuming view.
 */
export function useAllWorkspacesGitSync(): void {
  const runtimeRef = useRef<ReturnType<typeof createAllWorkspacesGitSyncRuntime> | null>(null);
  if (runtimeRef.current === null) {
    runtimeRef.current = createAllWorkspacesGitSyncRuntime();
  }

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    return runtime.start();
  }, []);
}
