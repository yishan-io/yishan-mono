import { useMemo } from "react";

import { useMeQuery } from "@/features/me/queries/useMeQuery";
import { useNodesQuery } from "@/features/nodes/queries/useNodesQuery";
import { useOrganizationsQuery } from "@/features/organizations";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import { useProjectsQuery } from "@/features/projects/queries/useProjectsQuery";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { findProjectName } from "../state/shell-selectors";
import { getCurrentOrganizationId } from "../state/shell-selectors";
import type { ShellState } from "../state/useShellState";
import { workspaceSidebarLabel } from "./shell-labels";
import {
  filterRecentTerminalsByScope,
  filterTerminalsByWorkspaceIdForNode,
  resolveCurrentNodeId,
  resolveSelectedWorkspace,
} from "./shell-screen-context-domain";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellScreenContext({
  shell,
  t,
}: {
  shell: ShellState;
  t: Translate;
}) {
  const meQuery = useMeQuery();
  const organizationsQuery = useOrganizationsQuery();
  const organizations = organizationsQuery.data ?? [];
  const currentOrganizationId = getCurrentOrganizationId(
    organizations.map((org) => org.id),
    shell.navigationOrganizationId,
    shell.selection,
  );
  const currentOrganization = organizations.find((org) => org.id === currentOrganizationId) ?? null;

  const currentOrgNodesQuery = useNodesQuery(currentOrganizationId ?? "", {
    enabled: !!currentOrganizationId,
  });
  const currentOrgProjectsQuery = useProjectsQuery(currentOrganizationId ?? "", {
    enabled: !!currentOrganizationId,
    withWorkspaces: true,
  });

  const currentNodes = currentOrgNodesQuery.data ?? [];
  const currentProjects = currentOrgProjectsQuery.data ?? [];
  const workspacesByProjectId = useMemo<Record<string, Workspace[]>>(
    () => Object.fromEntries(currentProjects.map((project) => [project.id, project.workspaces] as const)),
    [currentProjects],
  );

  const currentNodeId = useMemo(
    () =>
      resolveCurrentNodeId({
        currentNodes,
        currentOrganizationId,
        selectedNodeIdByOrganization: shell.selectedNodeIdByOrganization,
      }),
    [currentNodes, currentOrganizationId, shell.selectedNodeIdByOrganization],
  );

  const currentNode = useMemo(
    () => currentNodes.find((node) => node.id === currentNodeId) ?? null,
    [currentNodeId, currentNodes],
  );

  const displayedRecentTerminals = useMemo(
    () =>
      filterRecentTerminalsByScope({
        currentNodeId,
        currentOrganizationId,
        recentTerminals: shell.recentTerminals,
      }),
    [currentNodeId, currentOrganizationId, shell.recentTerminals],
  );

  const displayedTerminalsByWorkspaceId = useMemo(
    () =>
      filterTerminalsByWorkspaceIdForNode({
        currentNodeId,
        terminalsByWorkspaceId: shell.terminalsByWorkspaceId,
      }),
    [currentNodeId, shell.terminalsByWorkspaceId],
  );

  const selectedProjectName = useMemo(
    () => findProjectName(currentProjects, shell.selection.kind === "home" ? "" : shell.selection.projectId),
    [currentProjects, shell.selection],
  );

  const selectedWorkspace = useMemo(
    () =>
      resolveSelectedWorkspace({
        selectedWorkspaceContext: shell.selectedWorkspaceContext,
        workspacesByProjectId,
      }),
    [shell.selectedWorkspaceContext, workspacesByProjectId],
  );

  const selectedWorkspaceLabel = useMemo(() => {
    if (selectedWorkspace) {
      return workspaceSidebarLabel(selectedWorkspace, t);
    }

    return shell.selectedWorkspaceLabel;
  }, [selectedWorkspace, shell.selectedWorkspaceLabel, t]);

  const selectedNode = useMemo(() => {
    const nodeId = shell.selectedTerminal?.nodeId ?? selectedWorkspace?.nodeId;
    if (!nodeId) return null;

    return currentNodes.find((node) => node.id === nodeId) ?? null;
  }, [currentNodes, shell.selectedTerminal?.nodeId, selectedWorkspace?.nodeId]);

  const isShellLoading = organizationsQuery.isLoading || meQuery.isLoading;
  const isShellError = organizationsQuery.isError || meQuery.isError;

  return {
    currentNode,
    currentNodeId,
    currentNodes,
    currentOrganization,
    currentOrganizationId,
    currentOrgNodesQuery,
    currentOrgProjectsQuery,
    currentProjects,
    displayedRecentTerminals,
    displayedTerminalsByWorkspaceId,
    isShellError,
    isShellLoading,
    meAvatarUrl: meQuery.data?.avatarUrl,
    meName: meQuery.data?.name ?? t("common.yishanUser"),
    organizations,
    organizationsQuery,
    retryShell: () => Promise.all([organizationsQuery.refetch(), meQuery.refetch()]),
    selectedNode,
    selectedProjectName,
    selectedSelection: shell.selection.kind === "workspace" ? shell.selection : null,
    selectedTerminal: shell.selectedTerminal,
    selectedWorkspace,
    selectedWorkspaceContext: shell.selectedWorkspaceContext,
    selectedWorkspaceLabel,
    terminalLocationLabel: (terminal: (typeof displayedRecentTerminals)[number], projectName?: string | null) => {
      const name = projectName ?? findProjectName(currentProjects, terminal.projectId);
      if (name && terminal.subtitle) return `${name}/${terminal.subtitle}`;
      if (name) return name;

      return terminal.subtitle ?? null;
    },
    workspacesByProjectId,
  };
}

export type ShellScreenContext = ReturnType<typeof useShellScreenContext>;
