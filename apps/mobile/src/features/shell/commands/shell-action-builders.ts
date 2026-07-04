import type { Workspace } from "@/features/workspaces/workspaces.types";
import type { MobileShellAgentPresetKind } from "../state/shell-agent-presets";
import { getShellAgentLaunchCommand } from "../state/shell-agent-presets";
import type { ShellSelectedWorkspaceContext } from "../state/shellRuntimeAuthority";
import type { ShellCreateTerminalActionInput } from "./shell-create-terminal-domain";

export type OpenWorkspaceBrowserInput = {
  branchLabel?: string | null;
  focusPath?: string | null;
  nodeId?: string | null;
  organizationId: string;
  projectId: string;
  projectLabel: string | null;
  tab?: "files" | "changes" | "prs";
  terminalId?: string | null;
  terminalLabel: string | null;
  workspaceId: string;
  workspaceLabel: string | null;
};

type ShellActionItem = {
  destructive?: boolean;
  label: string;
  onPress: () => void;
};

type ShellQuickActionItem = {
  id: string;
  label: string;
  onPress: () => void;
};

export type ShellWorkspaceBrowserSelectionContext = {
  activePreviewKind: "diff" | "file" | "terminal" | null;
  activePreviewPath: string | null;
  nodeId: string | null;
  organizationId: string;
  projectId: string;
  projectLabel: string | null;
  terminalId: string | null;
  terminalLabel: string | null;
  workspaceBranch: string | null;
  workspaceId: string;
  workspaceLabel: string | null;
};

type AgentActionLabelMap = Record<MobileShellAgentPresetKind, string>;

const SHELL_AGENT_PRESET_ORDER: MobileShellAgentPresetKind[] = ["opencode", "codex", "claude"];

export function buildSelectedWorkspaceContextKey(
  selectedWorkspaceContext: ShellSelectedWorkspaceContext | null,
): string | null {
  if (!selectedWorkspaceContext) {
    return null;
  }

  return [
    selectedWorkspaceContext.organizationId,
    selectedWorkspaceContext.projectId,
    selectedWorkspaceContext.workspaceId,
  ].join(":");
}

export function wrapActionWithBeforeEffect<ActionArgs extends unknown[]>(
  before: () => void,
  action: (...args: ActionArgs) => void,
): (...args: ActionArgs) => void {
  return (...args: ActionArgs) => {
    before();
    action(...args);
  };
}

export function wrapOptionalActionWithBeforeEffect<ActionArgs extends unknown[]>(
  before: () => void,
  action: ((...args: ActionArgs) => void) | null | undefined,
): ((...args: ActionArgs) => void) | null {
  if (!action) {
    return null;
  }

  return wrapActionWithBeforeEffect(before, action);
}

export function buildWorkspaceBrowserInputFromSelection(
  context: ShellWorkspaceBrowserSelectionContext | null,
  tab: NonNullable<OpenWorkspaceBrowserInput["tab"]>,
): OpenWorkspaceBrowserInput | null {
  if (!context) {
    return null;
  }

  const focusPath =
    (tab === "files" && context.activePreviewKind === "file") ||
    (tab === "changes" && context.activePreviewKind === "diff")
      ? context.activePreviewPath
      : null;

  return {
    branchLabel: context.workspaceBranch,
    focusPath,
    nodeId: context.nodeId,
    organizationId: context.organizationId,
    projectId: context.projectId,
    projectLabel: context.projectLabel,
    tab,
    terminalId: context.terminalId,
    terminalLabel: context.terminalLabel,
    workspaceId: context.workspaceId,
    workspaceLabel: context.workspaceLabel,
  };
}

export function buildWorkspaceBrowserInputFromWorkspace(args: {
  projectLabel: string | null;
  terminalId?: string | null;
  terminalLabel: string | null;
  tab: NonNullable<OpenWorkspaceBrowserInput["tab"]>;
  workspace: Workspace;
  workspaceLabel: string | null;
}): OpenWorkspaceBrowserInput {
  const { projectLabel, tab, terminalId = null, terminalLabel, workspace, workspaceLabel } = args;

  return {
    branchLabel: workspace.branch ?? null,
    nodeId: workspace.nodeId,
    organizationId: workspace.organizationId,
    projectId: workspace.projectId,
    projectLabel,
    tab,
    terminalId,
    terminalLabel,
    workspaceId: workspace.id,
    workspaceLabel,
  };
}

export function buildAgentQuickActions(args: {
  labels: AgentActionLabelMap;
  onCreateTerminal: (workspace: Workspace, input: ShellCreateTerminalActionInput) => void;
  workspace: Workspace;
}): ShellQuickActionItem[] {
  const { labels, onCreateTerminal, workspace } = args;

  return SHELL_AGENT_PRESET_ORDER.map((agentKind) => ({
    id: agentKind,
    label: labels[agentKind],
    onPress: () =>
      onCreateTerminal(workspace, {
        agentKind,
        label: labels[agentKind],
        launchCommand: getShellAgentLaunchCommand(agentKind),
      }),
  }));
}

export function buildProjectMenuActions(args: {
  createWorkspaceLabel: string;
  deleteProjectLabel: string;
  onDeleteProject: () => void;
  onOpenWorkspaceCreate: () => void;
}): ShellActionItem[] {
  const { createWorkspaceLabel, deleteProjectLabel, onDeleteProject, onOpenWorkspaceCreate } = args;

  return [
    {
      label: createWorkspaceLabel,
      onPress: onOpenWorkspaceCreate,
    },
    {
      destructive: true,
      label: deleteProjectLabel,
      onPress: onDeleteProject,
    },
  ];
}

export function buildWorkspaceMenuActions(args: {
  closeWorkspaceLabel: string;
  onCloseWorkspace: () => void;
}): ShellActionItem[] {
  const { closeWorkspaceLabel, onCloseWorkspace } = args;

  return [
    {
      destructive: true,
      label: closeWorkspaceLabel,
      onPress: onCloseWorkspace,
    },
  ];
}
