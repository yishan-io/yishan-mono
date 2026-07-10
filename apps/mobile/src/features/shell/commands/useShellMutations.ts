import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { deleteProject } from "@/features/projects/projects.api";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { closeWorkspace } from "@/features/workspaces/workspaces.api";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { queryKeys } from "@/lib/query/query-keys";

export function useShellMutations({
  onProjectDeleted,
  onWorkspaceClosed,
}: {
  onProjectDeleted: (input: {
    organizationId: string;
    projectId: string;
    workspaceIds: string[];
    workspaceNodeIdsByWorkspaceId: Record<string, string>;
  }) => void;
  onWorkspaceClosed: (input: { organizationId: string; projectId: string; workspace: Workspace }) => void;
}) {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const queryClient = useQueryClient();

  const deleteProjectMutation = useMutation({
    mutationFn: async (input: {
      organizationId: string;
      projectId: string;
      workspaceIds: string[];
      workspaceNodeIdsByWorkspaceId: Record<string, string>;
    }) => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      await deleteProject(accessToken, input.organizationId, input.projectId);
    },
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects(input.organizationId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects(input.organizationId, true) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      onProjectDeleted(input);
    },
  });

  const closeWorkspaceMutation = useMutation({
    mutationFn: async (input: { organizationId: string; projectId: string; workspace: Workspace }) => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      return closeWorkspace(accessToken, input.organizationId, input.projectId, input.workspace);
    },
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(input.organizationId, input.projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects(input.organizationId, true) });
      onWorkspaceClosed(input);
    },
  });

  const deleteProjectAction = (project: ProjectWithWorkspaces, organizationId: string) => {
    deleteProjectMutation.mutate({
      organizationId,
      projectId: project.id,
      workspaceIds: project.workspaces.map((workspace) => workspace.id),
      workspaceNodeIdsByWorkspaceId: Object.fromEntries(
        project.workspaces.map((workspace) => [workspace.id, workspace.nodeId]),
      ),
    });
  };

  const closeWorkspaceAction = (project: ProjectWithWorkspaces, workspace: Workspace) => {
    closeWorkspaceMutation.mutate({
      organizationId: project.organizationId,
      projectId: project.id,
      workspace,
    });
  };

  return {
    closeWorkspaceAction,
    closeWorkspaceMutation,
    deleteProjectAction,
    deleteProjectMutation,
  };
}
