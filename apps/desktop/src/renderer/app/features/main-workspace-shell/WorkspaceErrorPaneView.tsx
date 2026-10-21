import {
  ProjectDeleteDialogView,
  deleteProject,
  projectStore,
  useProjectDeletionFlow,
} from "@renderer/domains/project";
import { WorkspaceErrorStateView, type WorkspaceItem, resolveWorkspaceProjectId } from "@renderer/domains/workspace";
import { useCallback } from "react";

type WorkspaceErrorPaneViewProps = {
  workspace: WorkspaceItem;
};

/** Composes workspace error recovery with the existing project deletion flow. */
export function WorkspaceErrorPaneView({ workspace }: WorkspaceErrorPaneViewProps) {
  const projects = projectStore((state) => state.projects);
  const projectId = resolveWorkspaceProjectId(workspace);
  const canDeleteProject = workspace.health === "path-missing" && projects.some((project) => project.id === projectId);
  const {
    pendingProjectDeletion,
    isDeletingProject,
    handleRequestProjectDeletion,
    handleCancelProjectDeletion,
    handleConfirmProjectDeletion,
  } = useProjectDeletionFlow({ projects, deleteProject });
  const handleDeleteProject = useCallback(() => {
    handleRequestProjectDeletion(projectId);
  }, [handleRequestProjectDeletion, projectId]);

  return (
    <>
      <WorkspaceErrorStateView
        workspace={workspace}
        onDeleteProject={canDeleteProject ? handleDeleteProject : undefined}
      />
      <ProjectDeleteDialogView
        open={Boolean(pendingProjectDeletion)}
        repoName={pendingProjectDeletion?.projectName ?? ""}
        isDeleting={isDeletingProject}
        onCancel={handleCancelProjectDeletion}
        onConfirm={handleConfirmProjectDeletion}
      />
    </>
  );
}
