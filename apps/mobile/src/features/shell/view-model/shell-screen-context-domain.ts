import type { Node } from "@/features/nodes/nodes.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { ALL_NODES_SELECTION } from "../state/shell-state-helpers";
import type { TerminalItem } from "../state/shell.types";
import type { ShellSelectedWorkspaceContext } from "../state/shellRuntimeAuthority";

export function resolveCurrentNodeId(input: {
  currentNodes: Node[];
  currentOrganizationId: string | null;
  selectedNodeIdByOrganization: Record<string, string>;
}): string | null {
  if (!input.currentOrganizationId) {
    return null;
  }

  const persistedNodeId = input.selectedNodeIdByOrganization[input.currentOrganizationId];
  if (persistedNodeId === ALL_NODES_SELECTION) {
    return null;
  }

  if (persistedNodeId && input.currentNodes.some((node) => node.id === persistedNodeId)) {
    return persistedNodeId;
  }

  return null;
}

export function filterRecentTerminalsByScope(input: {
  currentNodeId: string | null;
  currentOrganizationId: string | null;
  recentTerminals: TerminalItem[];
}): TerminalItem[] {
  return input.recentTerminals.filter((terminal) => {
    if (input.currentOrganizationId && terminal.orgId !== input.currentOrganizationId) {
      return false;
    }

    if (input.currentNodeId && terminal.nodeId && terminal.nodeId !== input.currentNodeId) {
      return false;
    }

    return true;
  });
}

export function filterTerminalsByWorkspaceIdForNode(input: {
  currentNodeId: string | null;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
}): Record<string, TerminalItem[]> {
  return Object.fromEntries(
    Object.entries(input.terminalsByWorkspaceId).map(([workspaceId, terminals]) => [
      workspaceId,
      terminals.filter((terminal) =>
        input.currentNodeId && terminal.nodeId ? terminal.nodeId === input.currentNodeId : true,
      ),
    ]),
  );
}

export function resolveSelectedWorkspace(input: {
  selectedWorkspaceContext: ShellSelectedWorkspaceContext | null;
  workspacesByProjectId: Record<string, Workspace[]>;
}): Workspace | null {
  const { selectedWorkspaceContext } = input;
  if (!selectedWorkspaceContext) {
    return null;
  }

  return (
    input.workspacesByProjectId[selectedWorkspaceContext.projectId]?.find(
      (workspace) => workspace.id === selectedWorkspaceContext.workspaceId,
    ) ?? null
  );
}
