import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

type ProjectLike = {
  id: string;
  name: string;
};

export type PendingProjectDeletion = {
  projectId: string;
  projectName: string;
};

type UseProjectDeletionFlowInput = {
  projects: ProjectLike[];
  deleteProject: (projectId: string) => Promise<void>;
};

export function useProjectDeletionFlow({ projects, deleteProject }: UseProjectDeletionFlowInput) {
  const [pendingProjectDeletion, setPendingProjectDeletion] = useState<PendingProjectDeletion | null>(null);

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProject(projectId);
    },
    onSuccess: () => {
      setPendingProjectDeletion(null);
    },
    onError: (error) => {
      console.error("Failed to delete project", error);
    },
  });

  const isDeletingProject = deleteProjectMutation.isPending;

  const handleRequestProjectDeletion = useCallback(
    (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        return;
      }

      setPendingProjectDeletion({
        projectId,
        projectName: project.name,
      });
    },
    [projects],
  );

  const handleCancelProjectDeletion = useCallback(() => {
    if (isDeletingProject) {
      return;
    }

    setPendingProjectDeletion(null);
  }, [isDeletingProject]);

  const handleConfirmProjectDeletion = useCallback(() => {
    if (!pendingProjectDeletion) {
      return;
    }

    deleteProjectMutation.mutate(pendingProjectDeletion.projectId);
  }, [deleteProjectMutation, pendingProjectDeletion]);

  return {
    pendingProjectDeletion,
    isDeletingProject,
    handleRequestProjectDeletion,
    handleCancelProjectDeletion,
    handleConfirmProjectDeletion,
  };
}
