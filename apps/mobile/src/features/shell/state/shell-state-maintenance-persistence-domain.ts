import type { ShellWorkspaceTabState, TerminalItem, WorkspacePaneLayoutState } from "./shell.types";

type ShellStateSnapshotInput = {
  nextPaneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  nextTerminalsByWorkspaceId: Record<string, TerminalItem[]>;
  nextWorkspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
  selectedNodeIdByOrganization: Record<string, string>;
};

function createWorkspaceBrowserStateId(organizationId: string, projectId: string, workspaceId: string) {
  if (!organizationId || !projectId || !workspaceId) {
    return "";
  }

  return `${organizationId}:${projectId}:${workspaceId}`;
}

export function buildStoredShellStateSnapshot(input: ShellStateSnapshotInput) {
  return {
    paneLayoutByWorkspaceId: input.nextPaneLayoutByWorkspaceId,
    selectedNodeIdByOrganization: input.selectedNodeIdByOrganization,
    terminalsByWorkspaceId: input.nextTerminalsByWorkspaceId,
    workspaceTabStateByWorkspaceId: input.nextWorkspaceTabStateByWorkspaceId,
  };
}

export function listWorkspaceBrowserStateIdsForCleanup(
  organizationId: string,
  projectId: string,
  workspaceIds: string[],
) {
  return workspaceIds.map((workspaceId) => createWorkspaceBrowserStateId(organizationId, projectId, workspaceId));
}
