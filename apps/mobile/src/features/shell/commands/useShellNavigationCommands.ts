import type { Router } from "expo-router";
import { useCallback } from "react";

import type { OpenWorkspaceBrowserInput } from "./shell-action-builders";

type UseShellNavigationCommandsInput = {
  closeDrawer: () => void;
  currentNodeId: string | null;
  currentOrganizationId: string | null;
  currentOrganizationName: string | null;
  router: Router;
};

export function useShellNavigationCommands({
  closeDrawer,
  currentNodeId,
  currentOrganizationId,
  currentOrganizationName,
  router,
}: UseShellNavigationCommandsInput) {
  const openWorkspaceBrowser = useCallback(
    (context: OpenWorkspaceBrowserInput) => {
      closeDrawer();
      router.push({
        pathname: "/(app)/shell/files",
        params: {
          branchLabel: context.branchLabel ?? "",
          focusPath: context.focusPath ?? "",
          orgId: context.organizationId,
          projectId: context.projectId,
          projectLabel: context.projectLabel ?? "",
          terminalId: context.terminalId ?? "",
          tab: context.tab ?? "files",
          terminalLabel: context.terminalLabel ?? "",
          workspaceId: context.workspaceId,
          workspaceLabel: context.workspaceLabel ?? "",
        },
      });
    },
    [closeDrawer, router],
  );

  const openSettings = useCallback(() => {
    closeDrawer();
    router.push({
      pathname: "/(app)/settings",
      params: {
        ...(currentNodeId ? { nodeId: currentNodeId } : {}),
        ...(currentOrganizationName ? { orgName: currentOrganizationName } : {}),
        ...(currentOrganizationId ? { orgId: currentOrganizationId } : {}),
      },
    });
  }, [closeDrawer, currentNodeId, currentOrganizationId, currentOrganizationName, router]);

  const openProfileControls = useCallback(() => {
    router.push({
      pathname: "/(app)/profile",
      params: {
        ...(currentOrganizationId ? { orgId: currentOrganizationId } : {}),
        ...(currentOrganizationName ? { orgName: currentOrganizationName } : {}),
      },
    });
  }, [currentOrganizationId, currentOrganizationName, router]);

  return {
    openProfileControls,
    openSettings,
    openWorkspaceBrowser,
  };
}
