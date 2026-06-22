import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceCreateNodeOption } from "@/features/workspaces/create";
import { createWorkspace } from "@/features/workspaces/workspaces.api";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { queryKeys } from "@/lib/query/query-keys";
import { type WorkspaceCreateDraft, buildCreateWorkspaceInput } from "./workspace-create-sheet-domain";

export function useWorkspaceCreateSheetSubmit({
  draft,
  onClose,
  onCreatedWorkspace,
  project,
  resetDraft,
  selectedNode,
}: {
  draft: WorkspaceCreateDraft;
  onClose: () => void;
  onCreatedWorkspace?: (workspace: Workspace) => void;
  project: ProjectWithWorkspaces | null;
  resetDraft: () => void;
  selectedNode: WorkspaceCreateNodeOption | null;
}) {
  const { t } = useAppLanguage();
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !project || !selectedNode) {
        throw new Error("Missing workspace create context");
      }

      return createWorkspace(
        accessToken,
        project.organizationId,
        project.id,
        buildCreateWorkspaceInput(draft, selectedNode),
      );
    },
    onSuccess: async (workspace) => {
      if (!project) {
        return;
      }

      queryClient.setQueryData<ProjectWithWorkspaces[] | undefined>(
        queryKeys.projects(project.organizationId, true),
        (current) =>
          current?.map((currentProject) => {
            if (
              currentProject.id !== project.id ||
              currentProject.workspaces.some((item) => item.id === workspace.id)
            ) {
              return currentProject;
            }

            return {
              ...currentProject,
              workspaces: [...currentProject.workspaces, workspace],
            };
          }),
      );
      queryClient.setQueryData<Workspace[] | undefined>(
        queryKeys.workspaces(project.organizationId, project.id),
        (current) => (current?.some((item) => item.id === workspace.id) ? current : [...(current ?? []), workspace]),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects(project.organizationId, true) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(project.organizationId, project.id) });
      onCreatedWorkspace?.(workspace);
      resetDraft();
      onClose();
    },
    onError: () => {
      setSubmitError(t("shell.createWorkspaceFailed"));
    },
  });

  const onSubmit = useCallback(() => {
    setSubmitError("");
    createMutation.mutate();
  }, [createMutation]);

  return {
    createMutation,
    onSubmit,
    submitError,
  };
}
