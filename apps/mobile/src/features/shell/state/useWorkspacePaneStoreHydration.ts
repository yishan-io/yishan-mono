import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { sanitizeWorkspacePaneStoreState } from "@/features/shell/state/shell-pane-state-machine";
import { createEmptyWorkspacePaneStoreState } from "@/features/shell/state/shell-state-helpers";
import type { WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { workspacePaneStoreStatesEqual } from "@/features/shell/state/shellPaneStoreEquality";
import {
  DETACHED_WORKSPACE_ID,
  type PaneStoreStateStorage,
  getStoredWorkspacePaneStoreState,
  restoreWorkspacePaneStoreState,
} from "@/features/shell/state/shellPaneStoreState";
import type { WorkspaceContext } from "./shell-route-state";

export function useWorkspacePaneStoreHydration({
  currentWorkspaceContext,
  hydratedWorkspaceId,
  hydratedWorkspaceIdRef,
  isScreenFocused,
  setHydratedWorkspaceId,
  setWorkspacePaneStoreState,
  storedState,
  workspacePaneStoreStateRef,
}: {
  currentWorkspaceContext: WorkspaceContext | null;
  hydratedWorkspaceId: string | null;
  hydratedWorkspaceIdRef: MutableRefObject<string | null>;
  isScreenFocused: boolean;
  setHydratedWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setWorkspacePaneStoreState: Dispatch<SetStateAction<WorkspacePaneStoreState>>;
  storedState: PaneStoreStateStorage;
  workspacePaneStoreStateRef: MutableRefObject<WorkspacePaneStoreState>;
}) {
  const currentWorkspaceId = currentWorkspaceContext?.workspaceId ?? null;

  // Restores the active workspace pane-store snapshot without touching inactive workspace cache entries.
  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    if (!currentWorkspaceId) {
      const detachedStoreState = createEmptyWorkspacePaneStoreState(DETACHED_WORKSPACE_ID);
      setWorkspacePaneStoreState((current) =>
        workspacePaneStoreStatesEqual(current, detachedStoreState) ? current : detachedStoreState,
      );
      hydratedWorkspaceIdRef.current = null;
      setHydratedWorkspaceId(null);
      return;
    }

    if (!storedState.hasRestoredStoredState) {
      return;
    }

    if (hydratedWorkspaceIdRef.current === currentWorkspaceId) {
      return;
    }

    const cachedStoreState =
      workspacePaneStoreStateRef.current.tabState.workspaceId === currentWorkspaceId
        ? workspacePaneStoreStateRef.current
        : null;
    const storedStoreState = getStoredWorkspacePaneStoreState(storedState, currentWorkspaceId);
    const nextStoreState = restoreWorkspacePaneStoreState({
      cachedStoreState,
      storedStoreState,
      workspaceId: currentWorkspaceId,
    });
    if (!workspacePaneStoreStatesEqual(workspacePaneStoreStateRef.current, nextStoreState)) {
      workspacePaneStoreStateRef.current = nextStoreState;
      setWorkspacePaneStoreState(nextStoreState);
    }
    hydratedWorkspaceIdRef.current = currentWorkspaceId;
    setHydratedWorkspaceId(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    hydratedWorkspaceIdRef,
    isScreenFocused,
    setHydratedWorkspaceId,
    setWorkspacePaneStoreState,
    storedState,
    workspacePaneStoreStateRef,
  ]);

  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    if (!currentWorkspaceId || hydratedWorkspaceId !== currentWorkspaceId) {
      return;
    }

    setWorkspacePaneStoreState((currentStoreState) => {
      const nextStoreState = sanitizeWorkspacePaneStoreState(currentStoreState, currentWorkspaceId);
      if (workspacePaneStoreStatesEqual(currentStoreState, nextStoreState)) {
        return currentStoreState;
      }

      workspacePaneStoreStateRef.current = nextStoreState;
      return nextStoreState;
    });
  }, [
    currentWorkspaceId,
    hydratedWorkspaceId,
    isScreenFocused,
    setWorkspacePaneStoreState,
    workspacePaneStoreStateRef,
  ]);
}
