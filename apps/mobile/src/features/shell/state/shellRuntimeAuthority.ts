import { findTerminal } from "./shell-selectors";
import type { ShellSelection, TerminalItem } from "./shell.types";

export type ShellSelectedWorkspaceContext = {
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

export type ShellSelectedTerminalWorkspace = {
  id: string;
  nodeId?: string | null;
  organizationId: string;
  projectId: string;
};

export type ShellRuntimeAuthority = {
  selectedTerminal: TerminalItem | null;
  selectedTerminalId: string | null;
  selectedTerminalWorkspace: ShellSelectedTerminalWorkspace | null;
  selectedWorkspaceContext: ShellSelectedWorkspaceContext | null;
  selectedWorkspaceLabel: string | null;
};

export function readSelectedWorkspaceContext(selection: ShellSelection): ShellSelectedWorkspaceContext | null {
  if (selection.kind !== "workspace") {
    return null;
  }

  return {
    organizationId: selection.orgId,
    projectId: selection.projectId,
    workspaceId: selection.workspaceId,
  };
}

export function resolveShellRuntimeAuthority(input: {
  activeTerminalId: string | null;
  selectedNodeIdByOrganization: Record<string, string>;
  selection: ShellSelection;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
}): ShellRuntimeAuthority {
  const selectedWorkspaceContext = readSelectedWorkspaceContext(input.selection);
  if (!selectedWorkspaceContext) {
    return {
      selectedTerminal: null,
      selectedTerminalId: null,
      selectedTerminalWorkspace: null,
      selectedWorkspaceContext: null,
      selectedWorkspaceLabel: null,
    };
  }

  const workspaceTerminals = input.terminalsByWorkspaceId[selectedWorkspaceContext.workspaceId] ?? [];
  const selectedTerminalId = input.activeTerminalId;
  const selectedTerminal = selectedTerminalId ? findTerminal(workspaceTerminals, selectedTerminalId) : null;
  const selectedWorkspaceLabel = workspaceTerminals[0]?.subtitle ?? null;
  const persistedNodeId = input.selectedNodeIdByOrganization[selectedWorkspaceContext.organizationId] ?? null;

  return {
    selectedTerminal,
    selectedTerminalId,
    selectedTerminalWorkspace: {
      id: selectedWorkspaceContext.workspaceId,
      nodeId: selectedTerminal?.nodeId ?? workspaceTerminals[0]?.nodeId ?? persistedNodeId,
      organizationId: selectedWorkspaceContext.organizationId,
      projectId: selectedWorkspaceContext.projectId,
    },
    selectedWorkspaceContext,
    selectedWorkspaceLabel,
  };
}
