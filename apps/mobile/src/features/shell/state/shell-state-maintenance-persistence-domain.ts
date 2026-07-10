import { createWorkspaceBrowserStateId } from "@/features/workspaces/browser/state/workspaceBrowserState";

import type { ShellWorkspaceTabState, TerminalItem, WorkspacePaneLayoutState } from "./shell.types";

type ShellStateSnapshotInput = {
  nextPaneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  nextTerminalsByWorkspaceId: Record<string, TerminalItem[]>;
  nextWorkspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
  selectedNodeIdByOrganization: Record<string, string>;
};

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
  workspaceNodeIdsByWorkspaceId: Record<string, string | null | undefined>,
  workspaceIds: string[],
  fallbackNodeId?: string | null,
) {
  return workspaceIds
    .map((workspaceId) =>
      createWorkspaceBrowserStateId(
        organizationId,
        projectId,
        workspaceId,
        workspaceNodeIdsByWorkspaceId[workspaceId] ?? fallbackNodeId ?? "",
      ),
    )
    .filter((stateId) => stateId.length > 0);
}
