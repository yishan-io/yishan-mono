import { useEffect, useRef } from "react";

import type {
  ShellWorkspaceTabState,
  TerminalItem,
  WorkspacePaneLayoutState,
} from "@/features/shell/state/shell.types";
import { saveStoredShellState, saveStoredTerminalRuntimeState } from "@/lib/storage/shell-state-storage";

type UseShellStoredStatePersistenceInput = {
  hasRestoredStoredState: boolean;
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  selectedNodeIdByOrganization: Record<string, string>;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

export function useShellStoredStatePersistence({
  hasRestoredStoredState,
  paneLayoutByWorkspaceId,
  selectedNodeIdByOrganization,
  terminalsByWorkspaceId,
  workspaceTabStateByWorkspaceId,
}: UseShellStoredStatePersistenceInput) {
  const pendingShellSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRuntimeSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasRestoredStoredState) {
      return;
    }

    if (pendingShellSaveTimeoutRef.current) {
      clearTimeout(pendingShellSaveTimeoutRef.current);
    }

    pendingShellSaveTimeoutRef.current = setTimeout(() => {
      pendingShellSaveTimeoutRef.current = null;
      void saveStoredShellState({
        paneLayoutByWorkspaceId,
        terminalsByWorkspaceId,
        selectedNodeIdByOrganization,
        workspaceTabStateByWorkspaceId,
      });
    }, 120);

    return () => {
      if (pendingShellSaveTimeoutRef.current) {
        clearTimeout(pendingShellSaveTimeoutRef.current);
        pendingShellSaveTimeoutRef.current = null;
      }
    };
  }, [
    hasRestoredStoredState,
    paneLayoutByWorkspaceId,
    selectedNodeIdByOrganization,
    terminalsByWorkspaceId,
    workspaceTabStateByWorkspaceId,
  ]);

  useEffect(() => {
    if (!hasRestoredStoredState) {
      return;
    }

    if (pendingRuntimeSaveTimeoutRef.current) {
      clearTimeout(pendingRuntimeSaveTimeoutRef.current);
    }

    pendingRuntimeSaveTimeoutRef.current = setTimeout(() => {
      pendingRuntimeSaveTimeoutRef.current = null;
      void saveStoredTerminalRuntimeState(terminalsByWorkspaceId);
    }, 250);

    return () => {
      if (pendingRuntimeSaveTimeoutRef.current) {
        clearTimeout(pendingRuntimeSaveTimeoutRef.current);
        pendingRuntimeSaveTimeoutRef.current = null;
      }
    };
  }, [hasRestoredStoredState, terminalsByWorkspaceId]);
}
