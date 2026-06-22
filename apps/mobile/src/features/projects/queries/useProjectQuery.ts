import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { getProject } from "@/features/projects/projects.api";
import { logMobileDebug, summarizeDebugError } from "@/lib/debug/mobileDebug";
import { queryKeys } from "@/lib/query/query-keys";

export function useProjectQuery(organizationId: string, projectId: string) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;

  return useQuery({
    queryKey: queryKeys.project(organizationId, projectId),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      logMobileDebug("project.query", "request", {
        organizationId,
        projectId,
      });

      try {
        const project = await getProject(accessToken, organizationId, projectId);
        logMobileDebug("project.query", "success", {
          organizationId,
          projectId,
          projectName: project.name,
        });
        return project;
      } catch (error) {
        logMobileDebug("project.query", "error", {
          error: summarizeDebugError(error),
          organizationId,
          projectId,
        });
        throw error;
      }
    },
    enabled: status === "authenticated" && !!accessToken && organizationId.length > 0 && projectId.length > 0,
  });
}
