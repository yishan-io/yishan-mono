import type { Router } from "expo-router";
import { useCallback } from "react";

import type { ShellSelection, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import type { WorkspaceContext } from "../state/shell-route-state";
import { ALL_NODES_SELECTION } from "../state/shell-state-helpers";

type NavigationState = {
  setFoldedProjectIds: (updater: (current: string[]) => string[]) => void;
  setNavigationOrganizationId: (organizationId: string | null) => void;
  setNavOpen: (value: boolean) => void;
};

type StoredState = {
  setSelectedNodeIdByOrganization: (updater: (current: Record<string, string>) => Record<string, string>) => void;
};

export function useShellNavigationSelectionCommands({
  navigation,
  router,
  setPendingSelection,
  storedState,
  syncRouteForPaneStore,
}: {
  navigation: NavigationState;
  router: Router;
  setPendingSelection: (selection: ShellSelection | null) => void;
  storedState: StoredState;
  syncRouteForPaneStore: (
    context: WorkspaceContext,
    nextStoreState: WorkspacePaneStoreState,
    options?: {
      includePreviewRoute?: boolean;
    },
  ) => void;
}) {
  const syncWorkspaceSelectionState = useCallback(
    (input: {
      includePreviewRoute?: boolean;
      nodeId: string | null;
      orgId: string;
      projectId: string;
      workspaceId: string;
      nextStoreState: WorkspacePaneStoreState;
    }) => {
      syncRouteForPaneStore(
        {
          orgId: input.orgId,
          projectId: input.projectId,
          workspaceId: input.workspaceId,
        },
        input.nextStoreState,
        {
          includePreviewRoute: input.includePreviewRoute,
        },
      );
      navigation.setNavigationOrganizationId(input.orgId);
      navigation.setFoldedProjectIds((current) =>
        current.includes(input.projectId) ? current.filter((item) => item !== input.projectId) : current,
      );
      if (!input.nodeId) {
        return;
      }

      const nodeId = input.nodeId;

      storedState.setSelectedNodeIdByOrganization((current) =>
        current[input.orgId] === nodeId ? current : { ...current, [input.orgId]: nodeId },
      );
    },
    [navigation, storedState, syncRouteForPaneStore],
  );

  const selectOrganization = useCallback(
    (orgId: string, options?: { keepNavOpen?: boolean }) => {
      navigation.setNavigationOrganizationId(orgId);

      if (options?.keepNavOpen) {
        navigation.setNavOpen(true);
        return;
      }

      setPendingSelection({ kind: "home" });
      router.replace("/(app)/shell");
      navigation.setNavOpen(false);
    },
    [navigation, router, setPendingSelection],
  );

  const selectNode = useCallback(
    (organizationId: string, nodeId: string | null) => {
      const nextNodeId = nodeId ?? ALL_NODES_SELECTION;
      storedState.setSelectedNodeIdByOrganization((current) =>
        current[organizationId] === nextNodeId ? current : { ...current, [organizationId]: nextNodeId },
      );
    },
    [storedState],
  );

  return {
    selectNode,
    selectOrganization,
    syncWorkspaceSelectionState,
  };
}
