import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth";
import { listProjects } from "@/features/projects/projects.api";
import type { Project, ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { logMobileDebug, summarizeDebugError } from "@/lib/debug/mobileDebug";
import { queryKeys } from "@/lib/query/query-keys";

export function useProjectsQuery(
  organizationId: string,
  options: { enabled?: boolean; withWorkspaces: true },
): ReturnType<typeof useQuery<ProjectWithWorkspaces[]>>;
export function useProjectsQuery(
  organizationId: string,
  options?: { enabled?: boolean; withWorkspaces?: false | undefined },
): ReturnType<typeof useQuery<Project[]>>;
export function useProjectsQuery(organizationId: string, options?: { enabled?: boolean; withWorkspaces?: boolean }) {
  const { session, status } = useAuth();
  const accessToken = session?.accessToken;
  const enabled = options?.enabled ?? true;
  const withWorkspaces = options?.withWorkspaces ?? false;
  const queryEnabled = enabled && status === "authenticated" && !!accessToken && organizationId.length > 0;

  if (withWorkspaces) {
    return useQuery<ProjectWithWorkspaces[]>({
      queryKey: queryKeys.projects(organizationId, true),
      queryFn: async () => {
        if (!accessToken) {
          throw new Error("Missing access token");
        }

        logMobileDebug("projects.query", "request", {
          organizationId,
          queryEnabled,
          withWorkspaces: true,
        });

        try {
          const projects = await listProjects(accessToken, organizationId, { withWorkspaces: true });
          logMobileDebug("projects.query", "success", {
            organizationId,
            projectIds: projects.map((project) => project.id),
            projectNames: projects.map((project) => project.name),
            withWorkspaces: true,
            workspaceCounts: projects.map((project) => ({
              id: project.id,
              workspaceCount: project.workspaces.length,
            })),
          });
          return projects;
        } catch (error) {
          logMobileDebug("projects.query", "error", {
            error: summarizeDebugError(error),
            organizationId,
            withWorkspaces: true,
          });
          throw error;
        }
      },
      enabled: queryEnabled,
    });
  }

  return useQuery<Project[]>({
    queryKey: queryKeys.projects(organizationId, false),
    queryFn: async () => {
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      logMobileDebug("projects.query", "request", {
        organizationId,
        queryEnabled,
        withWorkspaces: false,
      });

      try {
        const projects = await listProjects(accessToken, organizationId);
        logMobileDebug("projects.query", "success", {
          organizationId,
          projectIds: projects.map((project) => project.id),
          projectNames: projects.map((project) => project.name),
          withWorkspaces: false,
        });
        return projects;
      } catch (error) {
        logMobileDebug("projects.query", "error", {
          error: summarizeDebugError(error),
          organizationId,
          withWorkspaces: false,
        });
        throw error;
      }
    },
    enabled: queryEnabled,
  });
}
