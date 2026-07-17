import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { getRendererPlatform } from "../../../helpers/platform";
import { filterVisibleProjects } from "../../../helpers/projectHelpers";
import { resolveTargetBranchForCreate } from "../../../helpers/workspaceBranchNaming";
import { useCommands } from "../../../hooks/useCommands";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";
import { buildWorkspaceNavigationPath } from "../../../navigation/workspaceNavigation";
import { sessionStore } from "../../../store/sessionStore";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
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
  const organizationId = sessionStore((state) => state.selectedOrganizationId);
  const daemonId = sessionStore((state) => state.daemonId);
  const projects = workspaceStore((state) => state.projects);
  const displayProjectIds = workspaceStore((state) => state.displayProjectIds);
  const workspaces = workspaceStore((state) => state.workspaces);
  const { createWorkspace, renameWorkspace, renameWorkspaceBranch, listGitBranches, listAgentModels } = useCommands();
  const prefixMode = workspaceSettingsStore((state) => state.prefixMode);
  const customPrefix = workspaceSettingsStore((state) => state.customPrefix);
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const defaultAgentKind = agentSettingsStore((state) => state.defaultAgentKind);

  useDialogRegistration(open);

  const isRenameMode = mode === "rename";
  const selectableProjects = isRenameMode ? projects : filterVisibleProjects(projects, displayProjectIds);
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
    taskAgentKind,
    setTaskAgentKind,
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
    defaultTaskAgentKind: defaultAgentKind && inUseByAgentKind[defaultAgentKind] ? defaultAgentKind : undefined,
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
        taskRun:
          taskAgentKind && taskPrompt.trim()
            ? {
                agentKind: taskAgentKind,
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
      open={open}
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
              taskAgentKind={taskAgentKind}
              onTaskAgentKindChange={setTaskAgentKind}
              taskPrompt={taskPrompt}
              onTaskPromptChange={setTaskPrompt}
              taskModel={taskModel}
              onTaskModelChange={setTaskModel}
              isCreatingWorkspace={isCreatingWorkspace}
              inUseByAgentKind={inUseByAgentKind}
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
