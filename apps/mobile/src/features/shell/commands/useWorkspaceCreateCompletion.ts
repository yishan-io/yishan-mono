import type { QueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useCallback } from "react";

import { listWorkspaces } from "@/features/workspaces/workspaces.api";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { ActiveWorkspaceCreate } from "./workspace-create-submit-domain";
import { waitForCreatedWorkspace } from "./workspace-create-submit-domain";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseWorkspaceCreateCompletionInput = {
  accessToken: string | null;
  clearCreateState: () => void;
  isMountedRef: MutableRefObject<boolean>;
  onClose: () => void;
  onCreatedWorkspace?: (workspace: Workspace) => void;
  onFailure: (message: string) => void;
  queryClient: QueryClient;
  resetDraft: () => void;
  setProgressMessage: (message: string) => void;
  t: Translate;
};

export function useWorkspaceCreateCompletion({
  accessToken,
  clearCreateState,
  isMountedRef,
  onClose,
  onCreatedWorkspace,
  onFailure,
  queryClient,
  resetDraft,
  setProgressMessage,
  t,
}: UseWorkspaceCreateCompletionInput) {
  return useCallback(
    async (currentCreate: ActiveWorkspaceCreate) => {
      if (!isMountedRef.current || !accessToken) {
        return;
      }

      setProgressMessage(t("shell.workspaceCreateRefreshingStatus"));

      try {
        const createdWorkspace = await waitForCreatedWorkspace({
          loadWorkspaces: async () => {
            await queryClient.invalidateQueries({
              queryKey: queryKeys.workspaces(currentCreate.organizationId, currentCreate.projectId),
            });

            return queryClient.fetchQuery({
              queryKey: queryKeys.workspaces(currentCreate.organizationId, currentCreate.projectId),
              queryFn: () => listWorkspaces(accessToken, currentCreate.organizationId, currentCreate.projectId),
            });
          },
          workspaceId: currentCreate.workspaceId,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentCreate.organizationId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentCreate.organizationId, true) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.workspaces(currentCreate.organizationId, currentCreate.projectId),
          }),
        ]);

        clearCreateState();
        if (!isMountedRef.current) {
          return;
        }

        resetDraft();
        onCreatedWorkspace?.(createdWorkspace);
        onClose();
      } catch (error) {
        onFailure(getErrorMessage(error));
      }
    },
    [
      accessToken,
      clearCreateState,
      isMountedRef,
      onClose,
      onCreatedWorkspace,
      onFailure,
      queryClient,
      resetDraft,
      setProgressMessage,
      t,
    ],
  );
}
