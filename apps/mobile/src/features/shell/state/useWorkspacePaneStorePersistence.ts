import { useEffect } from "react";
import type { MutableRefObject } from "react";

import type { WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { workspacePaneLayoutsEqual, workspaceTabStatesEqual } from "@/features/shell/state/shellPaneStoreEquality";
import type { PaneStoreStateStorage } from "@/features/shell/state/shellPaneStoreState";
import type { WorkspaceContext } from "./shell-route-state";

export function useWorkspacePaneStorePersistence({
  currentWorkspaceContext,
  hydratedWorkspaceId,
  isScreenFocused,
  storedState,
  workspacePaneStoreState,
}: {
  currentWorkspaceContext: WorkspaceContext | null;
  hydratedWorkspaceId: string | null;
  isScreenFocused: boolean;
  storedState: PaneStoreStateStorage;
  workspacePaneStoreState: WorkspacePaneStoreState;
}) {
  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    if (!currentWorkspaceContext || hydratedWorkspaceId !== currentWorkspaceContext.workspaceId) {
      return;
    }

    storedState.setWorkspaceTabStateByWorkspaceId((current) => {
      const existing = current[currentWorkspaceContext.workspaceId];
      if (existing && workspaceTabStatesEqual(existing, workspacePaneStoreState.tabState)) {
        return current;
      }
      return { ...current, [currentWorkspaceContext.workspaceId]: workspacePaneStoreState.tabState };
    });
    storedState.setPaneLayoutByWorkspaceId((current) => {
      const existing = current[currentWorkspaceContext.workspaceId];
      if (existing && workspacePaneLayoutsEqual(existing, workspacePaneStoreState.layoutState)) {
        return current;
      }
      return { ...current, [currentWorkspaceContext.workspaceId]: workspacePaneStoreState.layoutState };
    });
  }, [currentWorkspaceContext, hydratedWorkspaceId, isScreenFocused, storedState, workspacePaneStoreState]);
}
