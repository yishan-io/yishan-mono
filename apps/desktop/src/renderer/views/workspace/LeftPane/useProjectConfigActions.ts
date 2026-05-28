import { useMutation } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../../../shared/contracts/externalApps";
import {
  DEFAULT_PROJECT_ICON_ID,
  findProjectIconOption,
} from "../../../components/projectIcons";
import { useCommands } from "../../../hooks/useCommands";
import {
  DEFAULT_ICON_BG_COLOR,
  type ProjectConfigDraft,
} from "./useProjectConfigFormState";

type ProjectLike = {
  id: string;
  name: string;
};

type UseProjectConfigActionsInput = {
  repo?: ProjectLike;
  draft: ProjectConfigDraft;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
  trimmedRepoLocalPath: string;
  onClose: () => void;
};

export function useProjectConfigActions({
  repo,
  draft,
  setDraft,
  trimmedRepoLocalPath,
  onClose,
}: UseProjectConfigActionsInput) {
  const { updateProjectConfig, openEntryInExternalApp, openLocalFolderDialog } = useCommands();

  const updateProjectConfigMutation = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      config: {
        name: string;
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
    if (!repo) {
      return;
    }

    const normalizedIconBgColor = /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : DEFAULT_ICON_BG_COLOR;
    updateProjectConfigMutation.mutate({
      projectId: repo.id,
      config: {
        name: draft.name.trim() || repo.name,
        worktreePath: draft.worktreePath.trim(),
        contextEnabled: draft.contextEnabled,
        icon: findProjectIconOption(draft.icon)?.id ?? DEFAULT_PROJECT_ICON_ID,
        color: normalizedIconBgColor,
        setupScript: draft.setupScript,
        postScript: draft.postScript,
        commands: draft.commands
          .map((item) => ({
            name: item.name.trim(),
            command: item.command.trim(),
          }))
          .filter((item) => item.name.length > 0 && item.command.length > 0),
      },
    });
  };

  return {
    isSaving: updateProjectConfigMutation.isPending,
    handlePickWorktreeFolder,
    handleOpenRepoLocalPath,
    handleSave,
  };
}
