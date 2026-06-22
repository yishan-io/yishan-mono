import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAuth } from "@/features/auth";
import { toCreateProjectInput } from "@/features/projects/forms/project-form";
import { createProject } from "@/features/projects/projects.api";
import { queryKeys } from "@/lib/query/query-keys";

export function useProjectCreateSheetSubmit({
  draft,
  onClose,
  organizationId,
  resetDraft,
}: {
  draft: { name: string; repoUrl: string };
  onClose: () => void;
  organizationId: string | null;
  resetDraft: () => void;
}) {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !organizationId) {
        throw new Error("Missing access token");
      }

      return createProject(accessToken, organizationId, toCreateProjectInput(draft));
    },
    onSuccess: async () => {
      if (organizationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects(organizationId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects(organizationId, true) });
      }

      resetDraft();
      onClose();
    },
  });

  const onSubmit = useCallback(() => {
    createMutation.mutate();
  }, [createMutation]);

  return {
    createMutation,
    onSubmit,
  };
}
