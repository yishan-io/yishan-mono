import { useCallback, useState } from "react";

type WorkspaceLike = {
  id: string;
  repoId: string;
  name: string;
};

export type PendingWorkspaceDeletion = {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  allowRemoveBranch: boolean;
};

type UseWorkspaceDeletionFlowInput = {
  workspaces: WorkspaceLike[];
  closeWorkspace: (workspaceId: string, input?: { removeBranch?: boolean }) => Promise<void>;
};

export function useWorkspaceDeletionFlow({ workspaces, closeWorkspace }: UseWorkspaceDeletionFlowInput) {
  const [pendingWorkspaceDeletion, setPendingWorkspaceDeletion] = useState<PendingWorkspaceDeletion | null>(null);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);

  const handleRequestWorkspaceDeletion = useCallback(
    (projectId: string, workspaceId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId && item.repoId === projectId);
      if (!workspace) {
        return;
      }

      setPendingWorkspaceDeletion({
        projectId,
        workspaceId,
        workspaceName: workspace.name,
        allowRemoveBranch: true,
      });
    },
    [workspaces],
  );

  const handleCancelWorkspaceDeletion = useCallback(() => {
    if (isDeletingWorkspace) {
      return;
    }

    setPendingWorkspaceDeletion(null);
  }, [isDeletingWorkspace]);

  const handleConfirmWorkspaceDeletion = useCallback(async () => {
    if (!pendingWorkspaceDeletion) {
      return;
    }

    setIsDeletingWorkspace(true);
    try {
      await closeWorkspace(pendingWorkspaceDeletion.workspaceId, {
        removeBranch: pendingWorkspaceDeletion.allowRemoveBranch,
      });
      setPendingWorkspaceDeletion(null);
    } finally {
      setIsDeletingWorkspace(false);
    }
  }, [closeWorkspace, pendingWorkspaceDeletion]);

  return {
    pendingWorkspaceDeletion,
    isDeletingWorkspace,
    setPendingWorkspaceDeletion,
    handleRequestWorkspaceDeletion,
    handleCancelWorkspaceDeletion,
    handleConfirmWorkspaceDeletion,
  };
}
