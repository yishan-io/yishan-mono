import { useEffect } from "react";

import { logMobileDebug } from "@/lib/debug/mobileDebug";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import { readWorkspaceSelection } from "./shell-recovery-helpers";

export function useShellSelectionRecovery({
  screenContext,
  shell,
}: {
  screenContext: ShellScreenContext;
  shell: ShellState;
}) {
  useEffect(() => {
    if (!shell.isScreenFocused) return;
    if (screenContext.isShellLoading || !shell.hasRestoredStoredState) return;

    const workspaceSelection = readWorkspaceSelection(shell.selection);
    if (!workspaceSelection) return;
    if (screenContext.organizations.length === 0) return;

    const selectionOrganizationExists = screenContext.organizations.some(
      (organization) => organization.id === workspaceSelection.orgId,
    );
    if (selectionOrganizationExists) {
      return;
    }

    logMobileDebug("shell.selection", "selected organization missing from current organizations", {
      currentOrganizationIds: screenContext.organizations.map((organization) => organization.id),
      selection: shell.selection,
    });
    shell.dropWorkspaceState({
      organizationId: workspaceSelection.orgId,
      projectId: workspaceSelection.projectId,
      workspaceId: workspaceSelection.workspaceId,
      workspaceNodeId:
        shell.terminalsByWorkspaceId[workspaceSelection.workspaceId]?.find(
          (terminal) => (terminal.nodeId?.trim() ?? "").length > 0,
        )?.nodeId ?? null,
    });
  }, [screenContext.isShellLoading, screenContext.organizations, shell]);

  useEffect(() => {
    if (!shell.isScreenFocused) return;
    if (screenContext.isShellLoading || !shell.hasRestoredStoredState) return;

    const workspaceSelection = readWorkspaceSelection(shell.selection);
    if (!workspaceSelection) return;
    if (screenContext.currentOrganizationId !== workspaceSelection.orgId) return;
    if (screenContext.currentOrgProjectsQuery.isPending || screenContext.currentOrgProjectsQuery.isError) return;

    const selectedProject = screenContext.currentProjects.find(
      (project) => project.id === workspaceSelection.projectId,
    );
    if (!selectedProject) {
      logMobileDebug("shell.selection", "selected project missing from current project list", {
        currentOrganizationId: screenContext.currentOrganizationId,
        currentProjectIds: screenContext.currentProjects.map((project) => project.id),
        selection: shell.selection,
      });
      shell.dropWorkspaceState({
        organizationId: workspaceSelection.orgId,
        projectId: workspaceSelection.projectId,
        workspaceId: workspaceSelection.workspaceId,
        workspaceNodeId:
          shell.terminalsByWorkspaceId[workspaceSelection.workspaceId]?.find(
            (terminal) => (terminal.nodeId?.trim() ?? "").length > 0,
          )?.nodeId ?? null,
      });
      return;
    }

    const selectedWorkspace = selectedProject.workspaces.find(
      (workspace) => workspace.id === workspaceSelection.workspaceId,
    );
    if (selectedWorkspace) {
      return;
    }

    logMobileDebug("shell.selection", "selected workspace missing from current project workspaces", {
      selection: shell.selection,
      workspaceIds: selectedProject.workspaces.map((workspace) => workspace.id),
    });
    shell.dropWorkspaceState({
      organizationId: workspaceSelection.orgId,
      projectId: workspaceSelection.projectId,
      workspaceId: workspaceSelection.workspaceId,
      workspaceNodeId:
        shell.terminalsByWorkspaceId[workspaceSelection.workspaceId]?.find(
          (terminal) => (terminal.nodeId?.trim() ?? "").length > 0,
        )?.nodeId ?? null,
    });
  }, [
    screenContext.currentOrganizationId,
    screenContext.currentOrgProjectsQuery.isError,
    screenContext.currentOrgProjectsQuery.isPending,
    screenContext.currentProjects,
    screenContext.isShellLoading,
    shell,
  ]);
}
