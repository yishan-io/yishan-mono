import { useEffect, useMemo, useState } from "react";

import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { WorkspaceListHierarchyMode } from "@/features/shell/state/shell-workspace-tree";

// Owns workspace-tree filter sheet state and project visibility preferences for the shell drawer.
export function useWorkspaceTreeFilterModel({
  currentOrganizationId,
  projects,
}: {
  currentOrganizationId: string | null;
  projects: ProjectWithWorkspaces[];
}) {
  const [open, setOpen] = useState(false);
  const [workspaceListHierarchyMode, setWorkspaceListHierarchyMode] = useState<WorkspaceListHierarchyMode>("by_node");
  const [projectQuickSearch, setProjectQuickSearch] = useState("");
  const [displayProjectIds, setDisplayProjectIds] = useState<string[]>([]);

  useEffect(() => {
    const projectIds = projects.map((project) => project.id);
    setDisplayProjectIds((current) => {
      if (projectIds.length === 0) {
        return [];
      }

      if (current.length === 0) {
        return projectIds;
      }

      const next = current.filter((projectId) => projectIds.includes(projectId));
      return next.length === 0 ? projectIds : next;
    });
  }, [projects]);

  useEffect(() => {
    if (currentOrganizationId === undefined) {
      return;
    }

    setProjectQuickSearch("");
    setOpen(false);
  }, [currentOrganizationId]);

  const filteredProjects = useMemo(() => {
    const searchValue = projectQuickSearch.trim().toLowerCase();
    if (!searchValue) {
      return projects;
    }

    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(searchValue) || (project.repoUrl ?? "").toLowerCase().includes(searchValue),
    );
  }, [projectQuickSearch, projects]);

  return {
    close: () => {
      setOpen(false);
      setProjectQuickSearch("");
    },
    displayProjectIds,
    filteredProjects,
    open,
    openSheet: () => setOpen(true),
    projectQuickSearch,
    setDisplayProjectIds,
    setProjectQuickSearch,
    setWorkspaceListHierarchyMode,
    workspaceListHierarchyMode,
  };
}
