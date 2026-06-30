import { useEffect } from "react";

import type { ShellFocusPreview } from "@/features/shell/state/shell.types";
import type { WorkspaceContext } from "./shell-route-state";
import type { PaneStoreStateStorage } from "./shellPaneStoreState";
import { useWorkspacePaneRouteInput } from "./useWorkspacePaneRouteInput";
import { useWorkspacePaneStoreHydration } from "./useWorkspacePaneStoreHydration";
import { useWorkspacePaneStorePersistence } from "./useWorkspacePaneStorePersistence";
import type { WorkspacePaneStoreRuntime } from "./useWorkspacePaneStoreRuntime";

type UseWorkspacePaneStoreLifecycleInput = {
  currentWorkspaceContext: WorkspaceContext | null;
  isScreenFocused: boolean;
  routePreview: ShellFocusPreview;
  runtime: WorkspacePaneStoreRuntime;
  storedState: PaneStoreStateStorage;
};

export function useWorkspacePaneStoreLifecycle({
  currentWorkspaceContext,
  isScreenFocused,
  routePreview,
  runtime,
  storedState,
}: UseWorkspacePaneStoreLifecycleInput) {
  useEffect(() => {
    runtime.workspacePaneStoreStateRef.current = runtime.workspacePaneStoreState;
  }, [runtime.workspacePaneStoreState, runtime.workspacePaneStoreStateRef]);

  useWorkspacePaneStoreHydration({
    currentWorkspaceContext,
    hydratedWorkspaceId: runtime.hydratedWorkspaceId,
    hydratedWorkspaceIdRef: runtime.hydratedWorkspaceIdRef,
    isScreenFocused,
    setHydratedWorkspaceId: runtime.setHydratedWorkspaceId,
    setWorkspacePaneStoreState: runtime.setWorkspacePaneStoreState,
    storedState,
    workspacePaneStoreStateRef: runtime.workspacePaneStoreStateRef,
  });

  useWorkspacePaneStorePersistence({
    currentWorkspaceContext,
    hydratedWorkspaceId: runtime.hydratedWorkspaceId,
    isScreenFocused,
    storedState,
    workspacePaneStoreState: runtime.workspacePaneStoreState,
  });

  useWorkspacePaneRouteInput({
    currentWorkspaceContext,
    hydratedWorkspaceId: runtime.hydratedWorkspaceId,
    isScreenFocused,
    routePreview,
    setWorkspacePaneStoreState: runtime.setWorkspacePaneStoreState,
    workspacePaneStoreStateRef: runtime.workspacePaneStoreStateRef,
  });
}
