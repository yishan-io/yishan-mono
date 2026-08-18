import { useCallback, useState } from "react";
import { selectProjectById } from "../../../../domains/project/state/projectSelectors";
import { supportsGitFeatures } from "../../../../helpers/projectGitCapability";

export function useProjectListDialogState() {
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [createWorkspaceProjectId, setCreateWorkspaceProjectId] = useState("");
  const [renameWorkspaceContext, setRenameWorkspaceContext] = useState<{
    projectId: string;
    workspaceId: string;
  } | null>(null);
  const [isProjectConfigOpen, setIsProjectConfigOpen] = useState(false);
  const [projectConfigProjectId, setProjectConfigProjectId] = useState("");

  const handleOpenCreateWorkspace = useCallback((projectId: string) => {
    // Non-git projects have no worktrees: never surface the create dialog.
    const project = selectProjectById(projectId);
    if (!supportsGitFeatures(project?.sourceType)) {
      return;
    }
    setCreateWorkspaceProjectId(projectId);
    setIsCreateWorkspaceOpen(true);
  }, []);

  const handleOpenProjectConfig = useCallback((projectId: string) => {
    setProjectConfigProjectId(projectId);
    setIsProjectConfigOpen(true);
  }, []);

  return {
    isCreateWorkspaceOpen,
    createWorkspaceProjectId,
    renameWorkspaceContext,
    isProjectConfigOpen,
    projectConfigProjectId,
    setIsCreateWorkspaceOpen,
    setCreateWorkspaceProjectId,
    setRenameWorkspaceContext,
    setIsProjectConfigOpen,
    setProjectConfigProjectId,
    handleOpenCreateWorkspace,
    handleOpenProjectConfig,
  };
}
