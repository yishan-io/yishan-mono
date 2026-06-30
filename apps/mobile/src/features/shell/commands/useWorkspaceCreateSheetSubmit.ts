import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceCreateNodeOption } from "@/features/workspaces/create";
import { readWorkspaceCreateFrontendEvent } from "@/features/workspaces/workspace-create-events";
import { listWorkspaces } from "@/features/workspaces/workspaces.api";
import { startRelayWorkspaceCreate } from "@/features/workspaces/workspaces.relay";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { generateId } from "@/helpers/generateId";
import { getRelayBaseUrl } from "@/lib/config/env";
import { queryKeys } from "@/lib/query/query-keys";
import { subscribeRelayFrontendEvents } from "@/lib/relay/relay-frontend-event-hub";
import { type WorkspaceCreateDraft, buildCreateWorkspaceInput } from "./workspace-create-sheet-domain";
import { waitForCreatedWorkspace } from "./workspace-create-submit-domain";

type ActiveWorkspaceCreate = {
  nodeId: string;
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export function useWorkspaceCreateSheetSubmit({
  draft,
  onClose,
  onCreatedWorkspace,
  project,
  resetDraft,
  selectedNode,
}: {
  draft: WorkspaceCreateDraft;
  onClose: () => void;
  onCreatedWorkspace?: (workspace: Workspace) => void;
  project: ProjectWithWorkspaces | null;
  resetDraft: () => void;
  selectedNode: WorkspaceCreateNodeOption | null;
}) {
  const { t } = useAppLanguage();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [activeCreate, setActiveCreate] = useState<ActiveWorkspaceCreate | null>(null);
  const activeCreateRef = useRef<ActiveWorkspaceCreate | null>(null);
  const frontendEventUnsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  const clearFrontendEventSubscription = useCallback(() => {
    frontendEventUnsubscribeRef.current?.();
    frontendEventUnsubscribeRef.current = null;
  }, []);

  const clearCreateState = useCallback(() => {
    activeCreateRef.current = null;
    clearFrontendEventSubscription();
    if (!isMountedRef.current) {
      return;
    }

    setActiveCreate(null);
    setProgressMessage("");
  }, [clearFrontendEventSubscription]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearFrontendEventSubscription();
    };
  }, [clearFrontendEventSubscription]);

  const handleWorkspaceCreateFailure = useCallback(
    (message: string) => {
      clearCreateState();
      if (!isMountedRef.current) {
        return;
      }

      setSubmitError(message || t("shell.createWorkspaceFailed"));
    },
    [clearCreateState, t],
  );

  const handleWorkspaceCreateCompleted = useCallback(
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
        handleWorkspaceCreateFailure(getErrorMessage(error));
      }
    },
    [
      accessToken,
      clearCreateState,
      handleWorkspaceCreateFailure,
      onClose,
      onCreatedWorkspace,
      queryClient,
      resetDraft,
      t,
    ],
  );

  const handleWorkspaceCreateMessage = useCallback(
    (message: Parameters<typeof readWorkspaceCreateFrontendEvent>[0]) => {
      const currentCreate = activeCreateRef.current;
      if (!currentCreate) {
        return;
      }

      const event = readWorkspaceCreateFrontendEvent(message);
      if (!event || event.workspaceId !== currentCreate.workspaceId) {
        return;
      }

      if (event.type === "started") {
        setProgressMessage(t("shell.workspaceCreatePendingStatus"));
        return;
      }

      if (event.type === "progress") {
        setProgressMessage(event.message || event.label);
        return;
      }

      if (event.type === "failed") {
        handleWorkspaceCreateFailure(event.message);
        return;
      }

      clearFrontendEventSubscription();
      void handleWorkspaceCreateCompleted(currentCreate);
    },
    [clearFrontendEventSubscription, handleWorkspaceCreateCompleted, handleWorkspaceCreateFailure, t],
  );

  const onSubmit = useCallback(() => {
    if (activeCreateRef.current) {
      return;
    }

    if (!accessToken || !project || !selectedNode) {
      setSubmitError(t("shell.createWorkspaceFailed"));
      return;
    }

    const workspaceId = generateId("workspace");
    const currentCreate: ActiveWorkspaceCreate = {
      nodeId: selectedNode.nodeId,
      organizationId: project.organizationId,
      projectId: project.id,
      workspaceId,
    };
    const createInput = buildCreateWorkspaceInput(draft, selectedNode);

    setSubmitError("");
    setProgressMessage(t("shell.workspaceCreatePendingStatus"));
    setActiveCreate(currentCreate);
    activeCreateRef.current = currentCreate;

    frontendEventUnsubscribeRef.current = subscribeRelayFrontendEvents({
      accessToken,
      node: {
        nodeId: currentCreate.nodeId,
        orgId: currentCreate.organizationId,
        projectId: currentCreate.projectId,
        workspaceId: currentCreate.workspaceId,
      },
      onMessage: ({ message }) => {
        handleWorkspaceCreateMessage(message);
      },
      relayUrl: getRelayBaseUrl(),
    });

    void startRelayWorkspaceCreate({
      accessToken,
      id: workspaceId,
      organizationId: currentCreate.organizationId,
      projectId: currentCreate.projectId,
      nodeId: currentCreate.nodeId,
      workspaceName: createInput.workspaceName,
      sourceBranch: createInput.sourceBranch,
      branch: createInput.branch,
      kind: createInput.kind,
    }).catch((error) => {
      handleWorkspaceCreateFailure(getErrorMessage(error));
    });
  }, [accessToken, draft, handleWorkspaceCreateFailure, handleWorkspaceCreateMessage, project, selectedNode, t]);

  return {
    isCreatingWorkspace: activeCreate !== null,
    onSubmit,
    progressMessage,
    submitError,
  };
}
