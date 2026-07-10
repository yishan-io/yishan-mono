import type { Workspace } from "@/features/workspaces/workspaces.types";
import { workspaceSidebarLabel } from "../view-model/shell-labels";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export type ShellCreateTerminalActionInput = {
  agentKind?: "opencode" | "codex" | "claude";
  label: string;
  launchCommand?: string | null;
};

export function buildShellCreateTerminalPayload(
  workspace: Workspace,
  input: ShellCreateTerminalActionInput,
  t: Translate,
) {
  return {
    agentKind: input.agentKind,
    label: input.label,
    launchCommand: input.launchCommand,
    nodeId: workspace.nodeId,
    orgId: workspace.organizationId,
    projectId: workspace.projectId,
    workspaceId: workspace.id,
    workspaceLabel: workspaceSidebarLabel(workspace, t),
  };
}
