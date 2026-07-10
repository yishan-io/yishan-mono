import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { ShellFocusPreview, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { workspacePaneStoreStatesEqual } from "@/features/shell/state/shellPaneStoreEquality";
import { resolveWorkspacePaneRouteInput } from "./shell-pane-route-input";
import type { WorkspaceContext } from "./shell-route-state";

export function useWorkspacePaneRouteInput({
  currentWorkspaceContext,
  hydratedWorkspaceId,
  isScreenFocused,
  routePreview,
  setWorkspacePaneStoreState,
  workspacePaneStoreStateRef,
}: {
  currentWorkspaceContext: WorkspaceContext | null;
  hydratedWorkspaceId: string | null;
  isScreenFocused: boolean;
  routePreview: ShellFocusPreview;
  setWorkspacePaneStoreState: Dispatch<SetStateAction<WorkspacePaneStoreState>>;
  workspacePaneStoreStateRef: MutableRefObject<WorkspacePaneStoreState>;
}) {
  const lastAppliedRouteInputKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!routePreview) {
      lastAppliedRouteInputKeyRef.current = null;
      return;
    }

    setWorkspacePaneStoreState((currentStoreState) => {
      const transition = resolveWorkspacePaneRouteInput({
        currentWorkspaceContext,
        hydratedWorkspaceId,
        isScreenFocused,
        lastAppliedRouteInputKey: lastAppliedRouteInputKeyRef.current,
        routePreview,
        storeState: currentStoreState,
      });

      lastAppliedRouteInputKeyRef.current = transition.nextRouteInputKey;
      if (!transition.shouldApply || workspacePaneStoreStatesEqual(currentStoreState, transition.nextStoreState)) {
        return currentStoreState;
      }

      workspacePaneStoreStateRef.current = transition.nextStoreState;
      return transition.nextStoreState;
    });
  }, [
    currentWorkspaceContext,
    hydratedWorkspaceId,
    isScreenFocused,
    routePreview,
    setWorkspacePaneStoreState,
    workspacePaneStoreStateRef,
  ]);
}
