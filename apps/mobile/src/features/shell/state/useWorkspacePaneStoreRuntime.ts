import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { createEmptyWorkspacePaneStoreState } from "@/features/shell/state/shell-state-helpers";
import type { WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import {
  DETACHED_WORKSPACE_ID,
  type PaneStoreStateStorage,
  getStoredWorkspacePaneStoreState,
  writeWorkspacePaneStoreStorage,
} from "@/features/shell/state/shellPaneStoreState";
import type { WorkspaceContext } from "./shell-route-state";

export type WorkspacePaneStoreRuntime = {
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  hydratedWorkspaceId: string | null;
  hydratedWorkspaceIdRef: MutableRefObject<string | null>;
  setHydratedWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setWorkspacePaneStoreState: Dispatch<SetStateAction<WorkspacePaneStoreState>>;
  workspacePaneStoreState: WorkspacePaneStoreState;
  workspacePaneStoreStateRef: MutableRefObject<WorkspacePaneStoreState>;
  writeWorkspacePaneStoreState: (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => void;
};

export function useWorkspacePaneStoreRuntime({
  currentWorkspaceContext,
  storedState,
}: {
  currentWorkspaceContext: WorkspaceContext | null;
  storedState: PaneStoreStateStorage;
}): WorkspacePaneStoreRuntime {
  // Owns the in-memory pane-store runtime for the currently focused workspace.
  // Hydration and persistence happen in dedicated hooks so inactive workspaces do not lose cached pane state.
  const { setPaneLayoutByWorkspaceId, setWorkspaceTabStateByWorkspaceId } = storedState;

  const [workspacePaneStoreState, setWorkspacePaneStoreState] = useState<WorkspacePaneStoreState>(() => {
    if (!currentWorkspaceContext) {
      return createEmptyWorkspacePaneStoreState(DETACHED_WORKSPACE_ID);
    }

    return (
      getStoredWorkspacePaneStoreState(storedState, currentWorkspaceContext.workspaceId) ??
      createEmptyWorkspacePaneStoreState(currentWorkspaceContext.workspaceId)
    );
  });
  const [hydratedWorkspaceId, setHydratedWorkspaceId] = useState<string | null>(null);
  const workspacePaneStoreStateRef = useRef(workspacePaneStoreState);
  const hydratedWorkspaceIdRef = useRef<string | null>(null);

  const getWorkspacePaneStoreState = useCallback(
    (workspaceId: string): WorkspacePaneStoreState => {
      if (
        currentWorkspaceContext?.workspaceId === workspaceId &&
        workspacePaneStoreStateRef.current.tabState.workspaceId === workspaceId
      ) {
        return workspacePaneStoreStateRef.current;
      }

      return (
        getStoredWorkspacePaneStoreState(storedState, workspaceId) ?? createEmptyWorkspacePaneStoreState(workspaceId)
      );
    },
    [currentWorkspaceContext?.workspaceId, storedState],
  );

  const writeWorkspacePaneStoreState = useCallback(
    (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => {
      if (currentWorkspaceContext?.workspaceId === workspaceId) {
        workspacePaneStoreStateRef.current = nextStoreState;
      }
      writeWorkspacePaneStoreStorage({
        currentWorkspaceId: currentWorkspaceContext?.workspaceId ?? null,
        nextStoreState,
        setHydratedWorkspaceId,
        setPaneLayoutByWorkspaceId,
        setWorkspacePaneStoreState,
        setWorkspaceTabStateByWorkspaceId,
        workspaceId,
      });
    },
    [currentWorkspaceContext?.workspaceId, setPaneLayoutByWorkspaceId, setWorkspaceTabStateByWorkspaceId],
  );

  return {
    getWorkspacePaneStoreState,
    hydratedWorkspaceId,
    hydratedWorkspaceIdRef,
    setHydratedWorkspaceId,
    setWorkspacePaneStoreState,
    workspacePaneStoreState,
    workspacePaneStoreStateRef,
    writeWorkspacePaneStoreState,
  };
}
