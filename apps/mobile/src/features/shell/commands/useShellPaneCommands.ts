import type { Router } from "expo-router";
import { useCallback } from "react";

import { getActivePaneTabFromWorkspacePaneStoreState } from "../state/shell-pane-layout-helpers";
import { routeSelectionFromActiveTab } from "../state/shell-pane-tab-helpers";
import {
  type ShellParams,
  type WorkspaceContext,
  buildSelectionParams,
  routeParamsEqual,
} from "../state/shell-route-state";
import { selectionsEqual } from "../state/shell-state-helpers";
import type { ShellSelection, WorkspacePaneStoreState } from "../state/shell.types";
import { buildClosePaneTabStoreMutation, buildSelectPaneTabStoreMutation } from "./shell-pane-command-domain";

type UseShellPaneCommandsInput = {
  activePaneTabId: string | null;
  currentWorkspaceContext: WorkspaceContext | null;
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  params: ShellParams;
  router: Router;
  selection: ShellSelection;
  setPendingSelection: (selection: ShellSelection | null) => void;
  writeWorkspacePaneStoreState: (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => void;
};

export function useShellPaneCommands({
  activePaneTabId,
  currentWorkspaceContext,
  getWorkspacePaneStoreState,
  params,
  router,
  selection,
  setPendingSelection,
  writeWorkspacePaneStoreState,
}: UseShellPaneCommandsInput) {
  const syncRouteForPaneStore = useCallback(
    (
      context: WorkspaceContext,
      nextStoreState: WorkspacePaneStoreState,
      options?: {
        includePreviewRoute?: boolean;
      },
    ) => {
      const nextActiveTab = getActivePaneTabFromWorkspacePaneStoreState(nextStoreState);
      const includePreviewRoute = options?.includePreviewRoute ?? false;
      const nextSelection = routeSelectionFromActiveTab(context, nextActiveTab);
      const nextParams = buildSelectionParams(nextSelection, nextActiveTab, {
        includePreview: includePreviewRoute,
      });

      if (!selectionsEqual(selection, nextSelection)) {
        setPendingSelection(nextSelection);
      }

      if (routeParamsEqual(params, nextParams)) {
        return;
      }

      router.replace({
        params: nextParams,
        pathname: "/(app)/shell",
      });
    },
    [params, router, selection, setPendingSelection],
  );

  const selectPaneTab = useCallback(
    (tabId: string) => {
      if (!currentWorkspaceContext) {
        return;
      }

      const currentStoreState = getWorkspacePaneStoreState(currentWorkspaceContext.workspaceId);
      const nextStoreState = buildSelectPaneTabStoreMutation(currentStoreState, activePaneTabId, tabId);
      if (!nextStoreState) {
        return;
      }

      writeWorkspacePaneStoreState(currentWorkspaceContext.workspaceId, nextStoreState);
      syncRouteForPaneStore(currentWorkspaceContext, nextStoreState);
    },
    [
      activePaneTabId,
      currentWorkspaceContext,
      getWorkspacePaneStoreState,
      syncRouteForPaneStore,
      writeWorkspacePaneStoreState,
    ],
  );

  const closeActiveTab = useCallback(() => {
    if (!currentWorkspaceContext || !activePaneTabId) {
      return;
    }

    const currentStoreState = getWorkspacePaneStoreState(currentWorkspaceContext.workspaceId);
    const mutation = buildClosePaneTabStoreMutation(currentStoreState, activePaneTabId);
    if (!mutation) {
      return;
    }

    writeWorkspacePaneStoreState(currentWorkspaceContext.workspaceId, mutation.nextStoreState);
    syncRouteForPaneStore(currentWorkspaceContext, mutation.nextStoreState);
  }, [
    activePaneTabId,
    currentWorkspaceContext,
    getWorkspacePaneStoreState,
    syncRouteForPaneStore,
    writeWorkspacePaneStoreState,
  ]);

  const closePaneTab = useCallback(
    (tabId: string) => {
      if (!currentWorkspaceContext) {
        return;
      }

      const currentStoreState = getWorkspacePaneStoreState(currentWorkspaceContext.workspaceId);
      const mutation = buildClosePaneTabStoreMutation(currentStoreState, tabId);
      if (!mutation) {
        return;
      }

      writeWorkspacePaneStoreState(currentWorkspaceContext.workspaceId, mutation.nextStoreState);
      if (mutation.shouldSyncRoute) {
        syncRouteForPaneStore(currentWorkspaceContext, mutation.nextStoreState);
      }
    },
    [currentWorkspaceContext, getWorkspacePaneStoreState, syncRouteForPaneStore, writeWorkspacePaneStoreState],
  );

  const closeWorkspacePaneTab = useCallback(
    (workspaceId: string, tabId: string) => {
      const currentStoreState = getWorkspacePaneStoreState(workspaceId);
      const mutation = buildClosePaneTabStoreMutation(currentStoreState, tabId);
      if (!mutation) {
        return;
      }

      writeWorkspacePaneStoreState(workspaceId, mutation.nextStoreState);
      if (mutation.shouldSyncRoute && currentWorkspaceContext?.workspaceId === workspaceId) {
        syncRouteForPaneStore(currentWorkspaceContext, mutation.nextStoreState);
      }
    },
    [currentWorkspaceContext, getWorkspacePaneStoreState, syncRouteForPaneStore, writeWorkspacePaneStoreState],
  );

  return {
    closeActiveTab,
    closePaneTab,
    closeWorkspacePaneTab,
    selectPaneTab,
    syncRouteForPaneStore,
  };
}
