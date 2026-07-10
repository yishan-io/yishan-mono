import { useCallback } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { useWorkspaceCreateSheetSubmit } from "../commands/useWorkspaceCreateSheetSubmit";
import { isWorkspaceCreateSubmitDisabled } from "../commands/workspace-create-sheet-domain";
import { useWorkspaceCreateSheetDraft } from "./useWorkspaceCreateSheetDraft";
import { useWorkspaceCreateSourceBranchSelector } from "./useWorkspaceCreateSourceBranchSelector";

export function useWorkspaceCreateSheetModel({
  currentNodeId,
  currentNodes,
  onClose,
  onCreatedWorkspace,
  open,
  project,
}: {
  currentNodeId: string | null;
  currentNodes: Node[];
  onClose: () => void;
  onCreatedWorkspace?: (workspace: Workspace) => void;
  open: boolean;
  project: ProjectWithWorkspaces | null;
}) {
  const { t } = useAppLanguage();
  const draft = useWorkspaceCreateSheetDraft({
    currentNodeId,
    currentNodes,
    open,
    project,
  });
  const submit = useWorkspaceCreateSheetSubmit({
    draft: draft.workspaceCreateDraft,
    onClose,
    onCreatedWorkspace,
    project,
    resetDraft: draft.resetDraft,
    selectedNode: draft.selectedNode,
  });
  const sourceBranchSelector = useWorkspaceCreateSourceBranchSelector({
    draft: draft.workspaceCreateDraft,
    onChangeSourceBranch: draft.onChangeSourceBranch,
    open,
    project,
    selectedNode: draft.selectedNode,
  });

  const handleClose = useCallback(() => {
    if (submit.isCreatingWorkspace) {
      return;
    }

    draft.resetDraft();
    onClose();
  }, [draft.resetDraft, onClose, submit.isCreatingWorkspace]);

  return {
    handleChangeTargetBranch: draft.handleChangeTargetBranch,
    handleCloseSourceBranchSelector: sourceBranchSelector.handleCloseSourceBranchSelector,
    handleClose,
    handleOpenSourceBranchSelector: sourceBranchSelector.handleOpenSourceBranchSelector,
    handleRetrySourceBranches: sourceBranchSelector.handleRetrySourceBranches,
    handleSelectNode: draft.handleSelectNode,
    handleSelectSourceBranch: sourceBranchSelector.handleSelectSourceBranch,
    isCreatingWorkspace: submit.isCreatingWorkspace,
    isLoadingSourceBranches: sourceBranchSelector.isLoadingSourceBranches,
    isSourceBranchSelectorDisabled: sourceBranchSelector.isSourceBranchSelectorDisabled,
    isSourceBranchSelectorOpen: sourceBranchSelector.isSourceBranchSelectorOpen,
    isSubmitDisabled: isWorkspaceCreateSubmitDisabled({
      draft: draft.workspaceCreateDraft,
      pending: submit.isCreatingWorkspace,
      projectPresent: !!project,
      selectedNode: draft.selectedNode,
    }),
    name: draft.name,
    nodeOptions: draft.nodeOptions,
    onChangeName: draft.onChangeName,
    onChangeSourceBranch: draft.onChangeSourceBranch,
    onSubmit: submit.onSubmit,
    project,
    progressMessage: submit.progressMessage,
    selectedNode: draft.selectedNode,
    sourceBranch: draft.sourceBranch,
    sourceBranchError: sourceBranchSelector.sourceBranchError,
    sourceBranchGroups: sourceBranchSelector.sourceBranchGroups,
    sourceBranchOptions: sourceBranchSelector.sourceBranchOptions,
    submitError: submit.submitError,
    t,
    targetBranch: draft.targetBranch,
  };
}

export type WorkspaceCreateSheetModel = ReturnType<typeof useWorkspaceCreateSheetModel>;
