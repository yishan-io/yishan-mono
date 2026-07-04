import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceCreateNodeOption } from "@/features/workspaces/create";
import { useWorkspaceFrontendEventsStream } from "@/features/workspaces/useWorkspaceFrontendEventsStream";
import { readWorkspaceCreateFrontendEvent } from "@/features/workspaces/workspace-create-events";
import type { WorkspaceFrontendEventsConnection } from "@/features/workspaces/workspace-frontend-events";
import { startRelayWorkspaceCreate } from "@/features/workspaces/workspaces.relay";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { generateId } from "@/helpers/generateId";
import { useWorkspaceCreateCompletion } from "./useWorkspaceCreateCompletion";
import { type WorkspaceCreateDraft, buildCreateWorkspaceInput } from "./workspace-create-sheet-domain";
import {
  type ActiveWorkspaceCreate,
  shouldHandleWorkspaceCreateEvent,
  syncPendingWorkspaceCreateId,
} from "./workspace-create-submit-domain";

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
  const [frontendEventNode, setFrontendEventNode] = useState<WorkspaceFrontendEventsConnection | null>(null);
  const [frontendEventsEnabled, setFrontendEventsEnabled] = useState(false);
  const activeCreateRef = useRef<ActiveWorkspaceCreate | null>(null);
  const isMountedRef = useRef(true);

  const clearCreateState = useCallback(() => {
    activeCreateRef.current = null;
    if (!isMountedRef.current) {
      return;
    }

    setFrontendEventsEnabled(false);
    setFrontendEventNode(null);
    setActiveCreate(null);
    setProgressMessage("");
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const handleWorkspaceCreateCompleted = useWorkspaceCreateCompletion({
    accessToken,
    clearCreateState,
    isMountedRef,
    onClose,
    onCreatedWorkspace,
    onFailure: handleWorkspaceCreateFailure,
    queryClient,
    resetDraft,
    setProgressMessage,
    t,
  });

  const handleWorkspaceCreateMessage = useCallback(
    (message: Parameters<typeof readWorkspaceCreateFrontendEvent>[0]) => {
      const currentCreate = activeCreateRef.current;
      if (!currentCreate) {
        return;
      }

      const event = readWorkspaceCreateFrontendEvent(message);
      if (
        !event ||
        !shouldHandleWorkspaceCreateEvent({
          currentCreate,
          event,
        })
      ) {
        return;
      }

      if (event.type === "started") {
        const nextCreate = syncPendingWorkspaceCreateId({
          currentCreate,
          workspaceId: event.workspaceId,
        });
        activeCreateRef.current = nextCreate;
        if (isMountedRef.current) {
          setActiveCreate(nextCreate);
        }
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

      setFrontendEventsEnabled(false);
      const latestCreate = activeCreateRef.current ?? currentCreate;
      void handleWorkspaceCreateCompleted(latestCreate);
    },
    [handleWorkspaceCreateCompleted, handleWorkspaceCreateFailure, t],
  );

  const frontendEventNodes = useMemo(() => (frontendEventNode ? [frontendEventNode] : []), [frontendEventNode]);

  useWorkspaceFrontendEventsStream({
    accessToken,
    enabled: frontendEventsEnabled && !!activeCreate,
    nodes: frontendEventNodes,
    onMessage: ({ message }) => {
      handleWorkspaceCreateMessage(message);
    },
  });

  const onSubmit = useCallback(() => {
    if (activeCreateRef.current) {
      return;
    }

    if (!accessToken || !project || !selectedNode) {
      setSubmitError(t("shell.createWorkspaceFailed"));
      return;
    }

    const createInput = buildCreateWorkspaceInput(draft, selectedNode);
    const workspaceId = generateId("workspace");
    const currentCreate: ActiveWorkspaceCreate = {
      branch: createInput.branch,
      nodeId: selectedNode.nodeId,
      organizationId: project.organizationId,
      projectId: project.id,
      requestedWorkspaceId: workspaceId,
      sourceBranch: createInput.sourceBranch,
      workspaceId,
      workspaceName: createInput.workspaceName,
    };

    setSubmitError("");
    setProgressMessage(t("shell.workspaceCreatePendingStatus"));
    setActiveCreate(currentCreate);
    setFrontendEventNode({
      nodeId: currentCreate.nodeId,
      orgId: currentCreate.organizationId,
      projectId: currentCreate.projectId,
      workspaceId: currentCreate.workspaceId,
    });
    setFrontendEventsEnabled(true);
    activeCreateRef.current = currentCreate;

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
    })
      .then((accepted) => {
        const pendingCreate = activeCreateRef.current;
        if (!pendingCreate) {
          return;
        }

        const nextCreate = syncPendingWorkspaceCreateId({
          currentCreate: pendingCreate,
          workspaceId: accepted.id,
        });
        activeCreateRef.current = nextCreate;
        if (isMountedRef.current) {
          setActiveCreate(nextCreate);
        }
      })
      .catch((error) => {
        handleWorkspaceCreateFailure(getErrorMessage(error));
      });
  }, [accessToken, draft, handleWorkspaceCreateFailure, project, selectedNode, t]);

  return {
    isCreatingWorkspace: activeCreate !== null,
    onSubmit,
    progressMessage,
    submitError,
  };
}
