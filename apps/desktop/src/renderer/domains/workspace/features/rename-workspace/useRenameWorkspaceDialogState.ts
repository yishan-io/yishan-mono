import { useEffect, useRef, useState } from "react";
import { renameWorkspace, renameWorkspaceBranch } from "../../commands/workspaceCommands";
import type { WorkspaceItem } from "../../workspaceTypes";

/**
 * Rename workspace dialog draft state (desktop7 Phase 24).
 *
 * Split from the create-workspace dialog state: the rename use case owns its
 * workspace name/branch drafts, dirty detection, and submission only. Node,
 * task-run, and branch-prefix autocomplete logic belongs to create-workspace.
 */
export function useRenameWorkspaceDialogState({
  open,
  projectId,
  workspaceId,
  workspaces,
}: {
  open: boolean;
  projectId: string;
  workspaceId?: string;
  workspaces: WorkspaceItem[];
}) {
  const [name, setName] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasInitializedRef = useRef(false);

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId && workspace.repoId === projectId && workspace.kind !== "local",
  );

  useEffect(() => {
    if (!open) {
      hasInitializedRef.current = false;
      return;
    }
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    setName(selectedWorkspace?.name ?? "");
    setTargetBranch(selectedWorkspace?.branch ?? "");
  }, [open, selectedWorkspace?.branch, selectedWorkspace?.name]);

  const sourceBranch = selectedWorkspace?.sourceBranch?.trim() ?? "";

  const hasRenameChanges = Boolean(
    selectedWorkspace &&
      (name.trim() !== (selectedWorkspace.name.trim() ?? "") ||
        targetBranch.trim() !== (selectedWorkspace.branch.trim() ?? "")),
  );
  const canRename =
    Boolean(selectedWorkspace) && !isSaving && Boolean(name.trim()) && Boolean(targetBranch.trim()) && hasRenameChanges;

  const handleRename = async (): Promise<boolean> => {
    if (isSaving || !selectedWorkspace) {
      return false;
    }

    const normalizedName = name.trim();
    const normalizedTargetBranch = targetBranch.trim();
    if (!normalizedName || !normalizedTargetBranch) {
      return false;
    }

    const hasNameChanged = normalizedName !== selectedWorkspace.name.trim();
    const hasBranchChanged = normalizedTargetBranch !== selectedWorkspace.branch.trim();
    if (!hasNameChanged && !hasBranchChanged) {
      return false;
    }

    setIsSaving(true);
    try {
      if (hasNameChanged) {
        renameWorkspace({
          repoId: projectId,
          workspaceId: selectedWorkspace.id,
          name: normalizedName,
        });
      }
      if (hasBranchChanged) {
        await renameWorkspaceBranch({
          repoId: projectId,
          workspaceId: selectedWorkspace.id,
          branch: normalizedTargetBranch,
        });
      }
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    name,
    setName,
    targetBranch,
    setTargetBranch,
    sourceBranch,
    isSaving,
    canRename,
    hasRenameChanges,
    selectedWorkspace,
    handleRename,
  };
}
