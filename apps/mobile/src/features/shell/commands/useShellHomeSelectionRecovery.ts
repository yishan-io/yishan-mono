import { useEffect, useRef } from "react";

import type { ShellState } from "../state/useShellState";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import { findFallbackWorkspace } from "./shell-recovery-helpers";

export function useShellHomeSelectionRecovery({
  screenContext,
  shell,
}: {
  screenContext: ShellScreenContext;
  shell: ShellState;
}) {
  const autoSelectedHomeWorkspaceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shell.isScreenFocused) return;
    if (screenContext.isShellLoading || !shell.hasRestoredStoredState) return;

    if (shell.selection.kind !== "home") {
      autoSelectedHomeWorkspaceKeyRef.current = null;
      return;
    }

    if (!screenContext.currentOrganizationId) {
      autoSelectedHomeWorkspaceKeyRef.current = null;
      return;
    }

    if (screenContext.currentOrgProjectsQuery.isPending || screenContext.currentOrgProjectsQuery.isError) {
      return;
    }

    const fallbackWorkspace = findFallbackWorkspace(screenContext.currentProjects);
    if (!fallbackWorkspace) {
      autoSelectedHomeWorkspaceKeyRef.current = null;
      return;
    }

    const selectionKey = `${screenContext.currentOrganizationId}:${fallbackWorkspace.id}`;
    if (autoSelectedHomeWorkspaceKeyRef.current === selectionKey) {
      return;
    }

    autoSelectedHomeWorkspaceKeyRef.current = selectionKey;
    shell.selectWorkspace(fallbackWorkspace);
  }, [
    screenContext.currentOrganizationId,
    screenContext.currentOrgProjectsQuery.isError,
    screenContext.currentOrgProjectsQuery.isPending,
    screenContext.currentProjects,
    screenContext.isShellLoading,
    shell,
  ]);
}
