import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAgentCommands, useGitCommands, useWorkspaceCommands } from "../../../../app/commands/useCommands";
import { useDisplayProjectIds, useProjects } from "../../../../domains/project/ui/hooks/useProjectReadHooks";
import { useDaemonId, useSelectedOrganizationId } from "../../../../domains/session";
import { useWorkspaceBranchPrefixSettings } from "../../../../domains/settings/ui/hooks/useSettingsReadHooks";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { getErrorMessage } from "../../../../helpers/errorHelpers";
import { getRendererPlatform } from "../../../../helpers/platform";
import { supportsGitFeatures } from "../../../../helpers/projectGitCapability";
import { filterVisibleProjects } from "../../../../helpers/projectHelpers";
import { resolveTargetBranchForCreate } from "../../../../helpers/workspaceBranchNaming";
import { buildWorkspaceNavigationPath } from "../../../../navigation/workspaceNavigation";
import { useDialogRegistration } from "../../../../ui/hooks/useDialogRegistration";
import { NodeSelectorSection } from "./createWorkspaceDialog/NodeSelectorSection";
import { ProjectAndSourceBranchSection } from "./createWorkspaceDialog/ProjectAndSourceBranchSection";
import { TaskRunSection } from "./createWorkspaceDialog/TaskRunSection";
import { WorkspaceDetailsSection } from "./createWorkspaceDialog/WorkspaceDetailsSection";
import { WorkspaceDialogSubmitButton } from "./createWorkspaceDialog/WorkspaceDialogSubmitButton";
import { useCreateWorkspaceDialogState } from "./useCreateWorkspaceDialogState";

type CreateWorkspaceDialogViewProps = {
  open: boolean;
  projectId: string;
  mode?: "create" | "rename";
  workspaceId?: string;
  onClose: () => void;
};

/** Renders one create/rename workspace dialog that reuses shared name/branch form controls. */
export function CreateWorkspaceDialogView({
  open,
  projectId,
  mode = "create",
  workspaceId,
  onClose,
}: CreateWorkspaceDialogViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const organizationId = useSelectedOrganizationId();
  const daemonId = useDaemonId();
  const projects = useProjects();
  const displayProjectIds = useDisplayProjectIds();
  const workspaces = workspaceStore((state) => state.workspaces);
  const { createWorkspace, renameWorkspace, renameWorkspaceBranch } = useWorkspaceCommands();
  const { listGitBranches } = useGitCommands();
  const { listAgentModels } = useAgentCommands();
  const { prefixMode, customPrefix } = useWorkspaceBranchPrefixSettings();

  useDialogRegistration(open);

  // Non-git projects have no worktrees; keep the dialog closed even if it was
  // already open when the target project changed.
  const targetProject = projects.find((item) => item.id === projectId);
  const isTargetNonGit = Boolean(projectId) && !supportsGitFeatures(targetProject?.sourceType);

  const isRenameMode = mode === "rename";
  // Create mode: only git-capable projects can receive worktrees, so non-git
  // projects are excluded from the project dropdown.
  const selectableProjects = isRenameMode
    ? projects
    : filterVisibleProjects(projects, displayProjectIds).filter((project) => supportsGitFeatures(project.sourceType));
  const branchInputPlaceholder = isRenameMode
    ? t("workspace.rename.branchNameLabel")
    : t("workspace.create.branchNameLabel");
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
    selectedWorkspace,
    defaultBranchPrefix,
    taskPrompt,
    setTaskPrompt,
    taskModel,
    setTaskModel,
  } = useCreateWorkspaceDialogState({
    open,
    projectId,
    workspaceId,
    isRenameMode,
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
  const hasRenameChanges =
    Boolean(selectedWorkspace) &&
    (name.trim() !== (selectedWorkspace?.name.trim() ?? "") ||
      targetBranch.trim() !== (selectedWorkspace?.branch.trim() ?? ""));
  const canRenameWorkspace =
    Boolean(selectedWorkspace) &&
    !isCreatingWorkspace &&
    Boolean(name.trim()) &&
    Boolean(targetBranch.trim()) &&
    hasRenameChanges;
  const canSubmitWorkspace = isRenameMode ? canRenameWorkspace : canCreateWorkspace;
  const submitLabel = isRenameMode ? t("workspace.actions.rename") : t("workspace.actions.create");
  const dialogTitle = isRenameMode ? t("workspace.rename.title") : t("workspace.create.title");
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
        navigate(buildWorkspaceNavigationPath(createdWorkspaceId));
      }
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleRenameWorkspace = async () => {
    if (isCreatingWorkspace || !selectedWorkspace) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedTargetBranch = targetBranch.trim();
    if (!normalizedName || !normalizedTargetBranch) {
      return;
    }

    const hasNameChanged = normalizedName !== selectedWorkspace.name.trim();
    const hasBranchChanged = normalizedTargetBranch !== selectedWorkspace.branch.trim();
    if (!hasNameChanged && !hasBranchChanged) {
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      if (hasNameChanged) {
        renameWorkspace({
          repoId: selectedProjectId,
          workspaceId: selectedWorkspace.id,
          name: normalizedName,
        });
      }
      if (hasBranchChanged) {
        await renameWorkspaceBranch({
          repoId: selectedProjectId,
          workspaceId: selectedWorkspace.id,
          branch: normalizedTargetBranch,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to rename workspace from dialog", getErrorMessage(error));
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleSubmit = () => {
    void (isRenameMode ? handleRenameWorkspace() : handleCreateWorkspace());
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmitWorkspace) {
      event.preventDefault();
      handleSubmit();
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
      <DialogTitle sx={{ pb: 1 }}>{dialogTitle}</DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <ProjectAndSourceBranchSection
            isRenameMode={isRenameMode}
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
            branchInputPlaceholder={branchInputPlaceholder}
            onTargetBranchChange={(branch) => {
              setTargetBranch(branch);
              hasEditedTargetBranchRef.current = true;
            }}
          />
          {!isRenameMode ? (
            <NodeSelectorSection
              selectedNodeId={selectedNodeId}
              onNodeChange={setSelectedNodeId}
              nodes={nodes}
              nodesError={nodesError}
              isCreatingWorkspace={isCreatingWorkspace}
            />
          ) : null}
          {!isRenameMode ? (
            <TaskRunSection
              taskPrompt={taskPrompt}
              onTaskPromptChange={setTaskPrompt}
              taskModel={taskModel}
              onTaskModelChange={setTaskModel}
              isCreatingWorkspace={isCreatingWorkspace}
              listAgentModels={listAgentModels}
            />
          ) : null}
          <WorkspaceDialogSubmitButton
            submitLabel={submitLabel}
            submitShortcutLabel={submitShortcutLabel}
            isCreatingWorkspace={isCreatingWorkspace}
            disabled={!canSubmitWorkspace}
            onClick={handleSubmit}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
