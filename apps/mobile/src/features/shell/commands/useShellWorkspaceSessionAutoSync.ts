import { useEffect, useRef } from "react";

import type { ShellSelectedWorkspaceContext } from "../state/shellRuntimeAuthority";
import { buildSelectedWorkspaceContextKey } from "./shell-action-builders";

type UseShellWorkspaceSessionAutoSyncInput = {
  refreshSessionSync: () => Promise<unknown>;
  selectedWorkspaceContext: ShellSelectedWorkspaceContext | null;
};

export function useShellWorkspaceSessionAutoSync({
  refreshSessionSync,
  selectedWorkspaceContext,
}: UseShellWorkspaceSessionAutoSyncInput) {
  const lastAutoRefreshedWorkspaceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const workspaceKey = buildSelectedWorkspaceContextKey(selectedWorkspaceContext);
    if (!workspaceKey) {
      lastAutoRefreshedWorkspaceKeyRef.current = null;
      return;
    }

    if (lastAutoRefreshedWorkspaceKeyRef.current === workspaceKey) {
      return;
    }

    lastAutoRefreshedWorkspaceKeyRef.current = workspaceKey;
    void refreshSessionSync();
  }, [refreshSessionSync, selectedWorkspaceContext]);
}
