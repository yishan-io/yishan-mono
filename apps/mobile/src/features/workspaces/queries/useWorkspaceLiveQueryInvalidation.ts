import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useAuth } from "@/features/auth";
import { logMobileDebug } from "@/lib/debug/mobileDebug";
import { queryKeys } from "@/lib/query/query-keys";
import { useWorkspaceFrontendEventsStream } from "../useWorkspaceFrontendEventsStream";
import type { WorkspaceFrontendEventsMessage } from "../workspace-frontend-events";
import {
  buildWorkspaceLiveQueryInvalidationPlan,
  isWorkspaceReadQueryKey,
} from "./workspace-live-query-invalidation-domain";

type WorkspaceLiveQueryScope = {
  id: string;
  nodeId?: string | null;
  organizationId: string;
  projectId: string;
};

export function useWorkspaceLiveQueryInvalidation({
  enabled,
  workspace,
}: {
  enabled: boolean;
  workspace: WorkspaceLiveQueryScope | null;
}) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken ?? null;
  const queryClient = useQueryClient();

  const nodes = useMemo(() => {
    if (!workspace?.nodeId) {
      return [];
    }

    return [
      {
        nodeId: workspace.nodeId,
        orgId: workspace.organizationId,
        projectId: workspace.projectId,
        workspaceId: workspace.id,
      },
    ];
  }, [workspace]);

  const handleMessage = useCallback(
    ({ message }: { message: WorkspaceFrontendEventsMessage }) => {
      if (!workspace) {
        return;
      }

      const plan = buildWorkspaceLiveQueryInvalidationPlan({
        message,
        scope: {
          nodeId: workspace.nodeId?.trim() ?? "",
          organizationId: workspace.organizationId,
          projectId: workspace.projectId,
          workspaceId: workspace.id,
        },
      });
      if (!plan) {
        return;
      }

      logMobileDebug("workspace.live", "invalidate queries", {
        change: plan.change ?? null,
        changedRelativePaths: plan.changedRelativePaths ?? [],
        invalidateProjectLists: plan.invalidateProjectLists,
        invalidateWorkspaceLists: plan.invalidateWorkspaceLists,
        invalidateWorkspaceReadQueries: plan.invalidateWorkspaceReadQueries,
        resource: plan.resource ?? null,
        topic: plan.topic,
        workspaceId: workspace.id,
      });

      const invalidations: Array<Promise<unknown>> = [];
      if (plan.invalidateProjectLists) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspace.organizationId) }));
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspace.organizationId, true) }),
        );
      }
      if (plan.invalidateWorkspaceLists) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.workspaces(workspace.organizationId, workspace.projectId),
          }),
        );
      }
      if (plan.invalidateWorkspaceReadQueries) {
        invalidations.push(
          queryClient.invalidateQueries({
            predicate: (query) =>
              isWorkspaceReadQueryKey(query.queryKey, {
                nodeId: workspace.nodeId?.trim() ?? "",
                organizationId: workspace.organizationId,
                projectId: workspace.projectId,
                workspaceId: workspace.id,
              }),
          }),
        );
      }

      // fire-and-forget live invalidation after the relay event has been accepted locally.
      void Promise.all(invalidations);
    },
    [queryClient, workspace],
  );

  useWorkspaceFrontendEventsStream({
    accessToken,
    enabled: enabled && status === "authenticated" && nodes.length > 0,
    nodes,
    onMessage: handleMessage,
  });
}
