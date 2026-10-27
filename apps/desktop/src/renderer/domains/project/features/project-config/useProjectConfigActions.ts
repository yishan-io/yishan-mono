import { openEntryInExternalApp } from "@renderer/domains/files";
import { SYSTEM_FILE_MANAGER_APP_ID } from "@renderer/domains/files";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useMutation } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect, useEffectEvent } from "react";
import { updateProjectConfig } from "../../commands/projectCommands";
import { openLocalFolderDialog } from "../../host/folderPicker";
import { DEFAULT_PROJECT_ICON_ID, findProjectIconOption } from "../../ui/projectIcons";
import { DEFAULT_ICON_BG_COLOR, type ProjectConfigDraft } from "./useProjectConfigFormState";

type ProjectLike = {
  id: string;
  name: string;
};

type UseProjectConfigActionsInput = {
  open: boolean;
  repo?: ProjectLike;
  draft: ProjectConfigDraft;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
  trimmedRepoLocalPath: string;
  onClose: () => void;
};

export function useProjectConfigActions({
  open,
  repo,
  draft,
  setDraft,
  trimmedRepoLocalPath,
  onClose,
}: UseProjectConfigActionsInput) {
  const updateProjectConfigMutation = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      config: {
        name: string;
        localPath: string;
        worktreePath: string;
        contextEnabled?: boolean;
        icon?: string;
        color?: string;
        setupScript?: string;
        postScript?: string;
        commands?: Array<{ name: string; command: string }>;
      };
    }) => {
      await updateProjectConfig(payload.projectId, payload.config);
    },
    onSuccess: () => {
      onClose();
    },
    onError: (error) => {
      console.error("Failed to update project config", error);
    },
  });

  const { reset } = updateProjectConfigMutation;
  const dismissSaveError = useEffectEvent(() => {
    // Resetting a pending mutation detaches its observer and loses the eventual error.
    if (!updateProjectConfigMutation.isPending) {
      reset();
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events are non-reactive; reset only at dialog/project session boundaries.
  useEffect(() => {
    dismissSaveError();
  }, [open, repo?.id]);

  const handlePickLocalFolder = async () => {
    const selectedPath = await openLocalFolderDialog(draft.localPath || undefined);
    if (selectedPath) {
      setDraft((previous) => ({ ...previous, localPath: selectedPath }));
    }
  };

  const handlePickWorktreeFolder = async () => {
    const selectedPath = await openLocalFolderDialog(draft.worktreePath || undefined);
    if (selectedPath) {
      setDraft((previous) => ({ ...previous, worktreePath: selectedPath }));
    }
  };

  const handleOpenRepoLocalPath = async () => {
    if (!trimmedRepoLocalPath) {
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: trimmedRepoLocalPath,
        appId: SYSTEM_FILE_MANAGER_APP_ID,
      });
    } catch (error) {
      console.error("Failed to open repository local path in file manager", error);
    }
  };

  const handleSave = () => {
    if (!repo || updateProjectConfigMutation.isPending) {
      return;
    }

    const normalizedIconBgColor = /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : DEFAULT_ICON_BG_COLOR;
    updateProjectConfigMutation.mutate({
      projectId: repo.id,
      config: {
        name: draft.name.trim() || repo.name,
        localPath: draft.localPath,
        worktreePath: draft.worktreePath.trim(),
        contextEnabled: draft.contextEnabled,
        icon: findProjectIconOption(draft.icon)?.id ?? DEFAULT_PROJECT_ICON_ID,
        color: normalizedIconBgColor,
        setupScript: draft.setupScript,
        postScript: draft.postScript,
        commands: draft.commands
          .map(({ id: _id, name, command }) => ({
            name: name.trim(),
            command: command.trim(),
          }))
          .filter((item) => item.name.length > 0 && item.command.length > 0),
      },
    });
  };

  return {
    isSaving: updateProjectConfigMutation.isPending,
    saveError: updateProjectConfigMutation.isError ? getErrorMessage(updateProjectConfigMutation.error) : null,
    handlePickLocalFolder,
    handlePickWorktreeFolder,
    handleOpenRepoLocalPath,
    handleSave,
  };
}
