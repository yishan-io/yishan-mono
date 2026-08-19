import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import { listAgentModels } from "@renderer/domains/agent";
import { listGitBranches } from "@renderer/domains/git";
import { supportsGitFeatures } from "@renderer/domains/project";
import { filterVisibleProjects } from "@renderer/domains/project";
import { useDisplayProjectIds, useProjects } from "@renderer/domains/project";
import { getRendererPlatform } from "@renderer/platform/platform";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useDaemonId, useSelectedOrganizationId } from "../../../../domains/session";
import { useDialogRegistration } from "../../../../domains/workbench";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { createWorkspace } from "../../commands/workspaceCommands";
import { useWorkspaceBranchPrefixSettings } from "../../hooks/useWorkspaceBranchPrefixSettings";
import { WorkspaceDetailsSection } from "../../ui/WorkspaceDetailsSection";
import { WorkspaceDialogSubmitButton } from "../../ui/WorkspaceDialogSubmitButton";
import { NodeSelectorSection } from "./createWorkspaceDialog/NodeSelectorSection";
import { ProjectAndSourceBranchSection } from "./createWorkspaceDialog/ProjectAndSourceBranchSection";
import { TaskRunSection } from "./createWorkspaceDialog/TaskRunSection";
import { useCreateWorkspaceDialogState } from "./useCreateWorkspaceDialogState";
import { resolveTargetBranchForCreate } from "./workspaceBranchNaming";

type CreateWorkspaceDialogViewProps = {
  open: boolean;
  projectId: string;
  onClose: () => void;
};

/** Renders the create-workspace dialog (desktop7 Phase 24 — rename mode split into rename-workspace). */
export function CreateWorkspaceDialogView({ open, projectId, onClose }: CreateWorkspaceDialogViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const organizationId = useSelectedOrganizationId();
  const daemonId = useDaemonId();
  const projects = useProjects();
  const displayProjectIds = useDisplayProjectIds();
  const workspaces = workspaceStore((state) => state.workspaces);
  const { prefixMode, customPrefix } = useWorkspaceBranchPrefixSettings();

  useDialogRegistration(open);

  // Non-git projects have no worktrees; keep the dialog closed even if it was
  // already open when the target project changed.
  const targetProject = projects.find((item) => item.id === projectId);
  const isTargetNonGit = Boolean(projectId) && !supportsGitFeatures(targetProject?.sourceType);

  // Create mode: only git-capable projects can receive worktrees, so non-git
  // projects are excluded from the project dropdown.
  const selectableProjects = filterVisibleProjects(projects, displayProjectIds).filter((project) =>
    supportsGitFeatures(project.sourceType),
  );
  const {
    selectedProjectId,
    setSelectedProjectId,
    sourceBranchOptions,
    sourceBranchGroups,
    sourceBranch,
    setSourceBranch,
    sourceBranchMenuAnchorEl,
    setSourceBranchMenuAnchorEl,
    isLoadingSourceBranches,
    name,
    setName,
    targetBranch,
    setTargetBranch,
    hasEditedTargetBranchRef,
    isCreatingWorkspace,
    setIsCreatingWorkspace,
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    nodesError,
    resetDraftInputs,
    defaultBranchPrefix,
    taskPrompt,
    setTaskPrompt,
    taskModel,
    setTaskModel,
  } = useCreateWorkspaceDialogState({
    open,
    projectId,
    organizationId,
    daemonId,
    projects: selectableProjects,
    workspaces,
    prefixMode,
    customPrefix,
    listGitBranches,
  });

  const canCreateWorkspace =
    Boolean(selectedProjectId) &&
    !isLoadingSourceBranches &&
    !isCreatingWorkspace &&
    Boolean(name.trim()) &&
    (!organizationId || Boolean(selectedNodeId)) &&
    Boolean(sourceBranch.trim()) &&
    Boolean(targetBranch.trim());
  const submitShortcutLabel = getRendererPlatform() === "darwin" ? "⌘↵" : "Ctrl+↵";
  const sourceBranchSelectValue = sourceBranchOptions.includes(sourceBranch) ? sourceBranch : "";
  const isSelectedSourceBranchWorktree = sourceBranchGroups.worktreeBranches.includes(sourceBranchSelectValue);

  const handleCreateWorkspace = async () => {
    if (isCreatingWorkspace) {
      return;
    }

    const normalizedName = name.trim();
    if (!selectedProjectId || !normalizedName) {
      return;
    }

    const normalizedTargetBranch = resolveTargetBranchForCreate({
      workspaceName: normalizedName,
      branchInput: targetBranch,
      branchPrefix: defaultBranchPrefix,
    });

    setIsCreatingWorkspace(true);
    try {
      const createdWorkspaceId = await createWorkspace({
        projectId: selectedProjectId,
        name: normalizedName,
        sourceBranch: sourceBranch.trim() || undefined,
        targetBranch: normalizedTargetBranch,
        nodeId: selectedNodeId || undefined,
        taskRun: taskPrompt.trim()
          ? {
              agentKind: "pi",
              prompt: taskPrompt.trim(),
              model: taskModel.trim() || undefined,
            }
          : undefined,
      });
      resetDraftInputs();
      onClose();
      if (createdWorkspaceId) {
        // Workspace route paths are owned by app/routes/workspaceNavigation
        // (desktop8 Phase 30); the create flow navigates with the same shape.
        navigate(`/?workspaceId=${createdWorkspaceId}`);
      }
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canCreateWorkspace) {
      event.preventDefault();
      void handleCreateWorkspace();
    }
  };

  return (
    <Dialog
      open={open && !isTargetNonGit}
      onClose={onClose}
      onKeyDown={handleDialogKeyDown}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>{t("workspace.create.title")}</DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <ProjectAndSourceBranchSection
            selectableProjects={selectableProjects}
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            sourceBranchOptions={sourceBranchOptions}
            sourceBranchGroups={sourceBranchGroups}
            sourceBranchSelectValue={sourceBranchSelectValue}
            onSourceBranchChange={(branch) => {
              setSourceBranch(branch);
              setSourceBranchMenuAnchorEl(null);
            }}
            sourceBranchMenuAnchorEl={sourceBranchMenuAnchorEl}
            onSourceBranchMenuOpen={setSourceBranchMenuAnchorEl}
            onSourceBranchMenuClose={() => setSourceBranchMenuAnchorEl(null)}
            isLoadingSourceBranches={isLoadingSourceBranches}
            isSelectedSourceBranchWorktree={isSelectedSourceBranchWorktree}
          />
          <WorkspaceDetailsSection
            name={name}
            onNameChange={setName}
            targetBranch={targetBranch}
            branchInputPlaceholder={t("workspace.create.branchNameLabel")}
            onTargetBranchChange={(branch) => {
              setTargetBranch(branch);
              hasEditedTargetBranchRef.current = true;
            }}
          />
          <NodeSelectorSection
            selectedNodeId={selectedNodeId}
            onNodeChange={setSelectedNodeId}
            nodes={nodes}
            nodesError={nodesError}
            isCreatingWorkspace={isCreatingWorkspace}
          />
          <TaskRunSection
            taskPrompt={taskPrompt}
            onTaskPromptChange={setTaskPrompt}
            taskModel={taskModel}
            onTaskModelChange={setTaskModel}
            isCreatingWorkspace={isCreatingWorkspace}
            listAgentModels={listAgentModels}
          />
          <WorkspaceDialogSubmitButton
            submitLabel={t("workspace.actions.create")}
            submitShortcutLabel={submitShortcutLabel}
            isCreatingWorkspace={isCreatingWorkspace}
            disabled={!canCreateWorkspace}
            onClick={() => {
              void handleCreateWorkspace();
            }}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
