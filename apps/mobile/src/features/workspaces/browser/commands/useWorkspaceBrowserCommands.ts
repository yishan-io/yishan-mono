import type { Router } from "expo-router";
import { useCallback } from "react";

import { createPreviewTab } from "@/features/shell/state/shell-pane-tab-helpers";
import { buildSelectionParams } from "@/features/shell/state/shell-route-state";
import type { WorkspaceGitChangeKind } from "@/features/workspaces/workspaces.types";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";

type UseWorkspaceBrowserCommandsInput = {
  browserStateId: string;
  organizationId: string;
  projectId: string;
  router: Router;
  setFocusedChangePath: (path: string) => void;
  setFocusedFilePath: (path: string) => void;
  workspaceId: string;
};

export function useWorkspaceBrowserCommands({
  browserStateId,
  organizationId,
  projectId,
  router,
  setFocusedChangePath,
  setFocusedFilePath,
  workspaceId,
}: UseWorkspaceBrowserCommandsInput) {
  const navigateBackToShell = useCallback(
    (params: ReturnType<typeof buildSelectionParams>) => {
      const href: {
        pathname: "/(app)/shell";
        params: ReturnType<typeof buildSelectionParams>;
      } = {
        pathname: "/(app)/shell" as const,
        params,
      };
      const navigatingRouter = router as Router & {
        navigate?: (href: {
          pathname: "/(app)/shell";
          params: ReturnType<typeof buildSelectionParams>;
        }) => void;
        dismissTo?: (href: {
          pathname: "/(app)/shell";
          params: ReturnType<typeof buildSelectionParams>;
        }) => void;
      };

      if (typeof navigatingRouter.navigate === "function") {
        navigatingRouter.navigate(href);
        return;
      }

      if (typeof navigatingRouter.dismissTo === "function") {
        navigatingRouter.dismissTo(href);
        return;
      }

      router.replace(href);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    const nextSelection = {
      kind: "workspace" as const,
      orgId: organizationId,
      projectId,
      workspaceId,
    };

    goBackOrReplace(router, {
      pathname: "/(app)/shell",
      params: buildSelectionParams(nextSelection, null),
    });
  }, [organizationId, projectId, router, workspaceId]);

  const openFile = useCallback(
    async (path: string) => {
      if (browserStateId) {
        setFocusedFilePath(path);
      }

      const nextSelection = {
        kind: "workspace" as const,
        orgId: organizationId,
        projectId,
        workspaceId,
      };

      navigateBackToShell(buildSelectionParams(nextSelection, createPreviewTab({ kind: "file", path })));
    },
    [browserStateId, navigateBackToShell, organizationId, projectId, setFocusedFilePath, workspaceId],
  );

  const openDiff = useCallback(
    async (path: string, changeKind: WorkspaceGitChangeKind) => {
      if (browserStateId) {
        setFocusedChangePath(path);
      }

      const nextSelection = {
        kind: "workspace" as const,
        orgId: organizationId,
        projectId,
        workspaceId,
      };

      navigateBackToShell(buildSelectionParams(nextSelection, createPreviewTab({ changeKind, kind: "diff", path })));
    },
    [browserStateId, navigateBackToShell, organizationId, projectId, setFocusedChangePath, workspaceId],
  );

  const onMissingContextBack = useCallback(() => {
    goBackOrReplace(router, "/(app)/shell");
  }, [router]);

  return {
    handleBack,
    onMissingContextBack,
    openDiff,
    openFile,
  };
}
