import { useState } from "react";

import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";

export type WorkspaceMenuContext = { project: ProjectWithWorkspaces; workspace: Workspace };

export function useShellSheets() {
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [orgSelectorOpen, setOrgSelectorOpen] = useState(false);
  const [projectCreateOrganizationId, setProjectCreateOrganizationId] = useState<string | null>(null);
  const [projectMenuProject, setProjectMenuProject] = useState<ProjectWithWorkspaces | null>(null);
  const [projectMenuOrganizationId, setProjectMenuOrganizationId] = useState<string | null>(null);
  const [workspaceCreateProject, setWorkspaceCreateProject] = useState<ProjectWithWorkspaces | null>(null);
  const [workspaceMenuContext, setWorkspaceMenuContext] = useState<WorkspaceMenuContext | null>(null);
  const openOrgSelector = () => setOrgSelectorOpen(true);
  const closeOrgSelector = () => setOrgSelectorOpen(false);
  const openQuickActions = () => setQuickActionsOpen(true);
  const closeQuickActions = () => setQuickActionsOpen(false);

  const openProjectCreate = (organizationId: string | null) => setProjectCreateOrganizationId(organizationId);
  const closeProjectCreate = () => setProjectCreateOrganizationId(null);

  const openProjectMenu = (project: ProjectWithWorkspaces, organizationId: string | null) => {
    setProjectMenuProject(project);
    setProjectMenuOrganizationId(organizationId);
  };
  const closeProjectMenu = () => {
    setProjectMenuProject(null);
    setProjectMenuOrganizationId(null);
  };

  const openWorkspaceCreate = (project: ProjectWithWorkspaces) => {
    setWorkspaceCreateProject(project);
    setProjectMenuProject(null);
    setProjectMenuOrganizationId(null);
  };
  const closeWorkspaceCreate = () => setWorkspaceCreateProject(null);

  const openWorkspaceMenu = (project: ProjectWithWorkspaces, workspace: Workspace) =>
    setWorkspaceMenuContext({ project, workspace });
  const closeWorkspaceMenu = () => setWorkspaceMenuContext(null);

  return {
    closeQuickActions,
    closeOrgSelector,
    closeProjectCreate,
    closeProjectMenu,
    closeWorkspaceCreate,
    closeWorkspaceMenu,
    openQuickActions,
    openOrgSelector,
    openProjectCreate,
    openProjectMenu,
    openWorkspaceCreate,
    openWorkspaceMenu,
    orgSelectorOpen,
    projectCreateOrganizationId,
    projectMenuOrganizationId,
    projectMenuProject,
    quickActionsOpen,
    workspaceCreateProject,
    workspaceMenuContext,
  };
}
