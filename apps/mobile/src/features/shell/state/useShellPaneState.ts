import { useEffect, useMemo, useRef } from "react";

import {
  getActivePaneTabFromWorkspacePaneStoreState,
  getActivePaneTabsFromWorkspacePaneStoreState,
} from "@/features/shell/state/shell-pane-layout-helpers";
import { type WorkspaceContext, previewFromTab } from "@/features/shell/state/shell-route-state";
import type { ShellFocusPreview, ShellSelection } from "@/features/shell/state/shell.types";
import { logMobileDebug, serializeDebugValue } from "@/lib/debug/mobileDebug";
import type { PaneStoreStateStorage } from "./shellPaneStoreState";
import { resolveEffectiveWorkspacePaneStoreState } from "./shellPaneStoreState";
import { useWorkspacePaneStoreLifecycle } from "./useWorkspacePaneStoreLifecycle";
import { useWorkspacePaneStoreRuntime } from "./useWorkspacePaneStoreRuntime";

type UseShellPaneStateInput = {
  currentWorkspaceContext: WorkspaceContext | null;
  isScreenFocused: boolean;
  routePreview: ShellFocusPreview;
  selection: ShellSelection;
  storedState: PaneStoreStateStorage;
};

export function useShellPaneState({
  currentWorkspaceContext,
  isScreenFocused,
  routePreview,
  selection,
  storedState,
}: UseShellPaneStateInput) {
  const paneStoreRuntime = useWorkspacePaneStoreRuntime({
    currentWorkspaceContext,
    storedState,
  });
  const effectiveWorkspacePaneStoreState = useMemo(() => {
    return resolveEffectiveWorkspacePaneStoreState({
      currentWorkspaceId: currentWorkspaceContext?.workspaceId ?? null,
      getWorkspacePaneStoreState: paneStoreRuntime.getWorkspacePaneStoreState,
      hydratedWorkspaceId: paneStoreRuntime.hydratedWorkspaceId,
      runtimeWorkspacePaneStoreState: paneStoreRuntime.workspacePaneStoreState,
    });
  }, [
    currentWorkspaceContext,
    paneStoreRuntime.getWorkspacePaneStoreState,
    paneStoreRuntime.hydratedWorkspaceId,
    paneStoreRuntime.workspacePaneStoreState,
  ]);
  const { getWorkspacePaneStoreState, hydratedWorkspaceId, workspacePaneStoreState, writeWorkspacePaneStoreState } =
    paneStoreRuntime;

  useWorkspacePaneStoreLifecycle({
    currentWorkspaceContext,
    isScreenFocused,
    routePreview,
    runtime: paneStoreRuntime,
    storedState,
  });

  const activePaneTab = useMemo(
    () => getActivePaneTabFromWorkspacePaneStoreState(effectiveWorkspacePaneStoreState),
    [effectiveWorkspacePaneStoreState],
  );
  const preview = useMemo(() => previewFromTab(activePaneTab), [activePaneTab]);
  const activeTerminalId = activePaneTab?.kind === "terminal" ? activePaneTab.terminalId : null;
  const paneTabs = useMemo(
    () => getActivePaneTabsFromWorkspacePaneStoreState(effectiveWorkspacePaneStoreState),
    [effectiveWorkspacePaneStoreState],
  );
  const lastPaneDebugSnapshotRef = useRef<string | null>(null);
  const paneDebugSnapshot = useMemo(
    () => ({
      activePaneTab:
        activePaneTab === null
          ? null
          : {
              id: activePaneTab.id,
              kind: activePaneTab.kind,
              ...(activePaneTab.kind === "terminal"
                ? { terminalId: activePaneTab.terminalId }
                : {
                    path: activePaneTab.path,
                    previewKind: activePaneTab.kind,
                  }),
            },
      effectivePaneWorkspaceId: effectiveWorkspacePaneStoreState.tabState.workspaceId,
      hydratedWorkspaceId,
      paneTabIds: paneTabs.map((tab) => tab.id),
      routePreview:
        routePreview === null
          ? null
          : {
              path: routePreview.path,
              kind: routePreview.kind,
            },
      runtimePaneWorkspaceId: workspacePaneStoreState.tabState.workspaceId,
      selection:
        selection.kind === "home"
          ? {
              kind: selection.kind,
            }
          : {
              kind: selection.kind,
              orgId: selection.orgId,
              projectId: selection.projectId,
              workspaceId: selection.workspaceId,
            },
      targetWorkspaceId: currentWorkspaceContext?.workspaceId ?? null,
    }),
    [
      activePaneTab,
      currentWorkspaceContext,
      effectiveWorkspacePaneStoreState,
      hydratedWorkspaceId,
      paneTabs,
      routePreview,
      selection,
      workspacePaneStoreState,
    ],
  );

  useEffect(() => {
    if (!currentWorkspaceContext) {
      return;
    }

    const nextSnapshot = serializeDebugValue(paneDebugSnapshot);
    if (lastPaneDebugSnapshotRef.current === nextSnapshot) {
      return;
    }

    lastPaneDebugSnapshotRef.current = nextSnapshot;
    logMobileDebug("shell.pane", "resolved effective workspace pane state", paneDebugSnapshot);
  }, [currentWorkspaceContext, paneDebugSnapshot]);

  return {
    activePaneTab,
    activeTerminalId,
    getWorkspacePaneStoreState,
    hydratedWorkspaceId,
    paneTabs,
    preview,
    writeWorkspacePaneStoreState,
  };
}
