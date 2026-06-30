import type { TerminalItem } from "@/features/shell/state/shell.types";

type CreateTerminalItemInput = {
  agentKind?: TerminalItem["agentKind"];
  createdAt: string;
  id: string;
  label: string;
  launchCommand?: string | null;
  modelId: string;
  nodeId: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
  workspaceLabel: string;
};

export function buildUniqueTerminalLabel(terminals: TerminalItem[], baseLabel: string) {
  const existingLabels = new Set(terminals.map((terminal) => terminal.label.trim()));
  if (!existingLabels.has(baseLabel)) {
    return baseLabel;
  }

  let suffix = 2;
  while (existingLabels.has(`${baseLabel} ${suffix}`)) {
    suffix += 1;
  }

  return `${baseLabel} ${suffix}`;
}

export function buildCreatedTerminalItem(input: CreateTerminalItemInput): TerminalItem {
  return {
    agentKind: input.agentKind,
    cachedOutput: null,
    createdAt: input.createdAt,
    id: input.id,
    label: input.label,
    lastMessagePreview: null,
    launchCommand: input.launchCommand,
    modelId: input.modelId,
    nodeId: input.nodeId,
    orgId: input.orgId,
    projectId: input.projectId,
    session: null,
    status: "initializing",
    subtitle: input.workspaceLabel,
    updatedAt: input.createdAt,
    workspaceId: input.workspaceId,
  };
}

export function prependTerminalToWorkspace(
  terminalsByWorkspaceId: Record<string, TerminalItem[]>,
  terminal: TerminalItem,
) {
  return {
    ...terminalsByWorkspaceId,
    [terminal.workspaceId]: [terminal, ...(terminalsByWorkspaceId[terminal.workspaceId] ?? [])],
  };
}

export function ensureTerminalInWorkspace(
  terminalsByWorkspaceId: Record<string, TerminalItem[]>,
  terminal: TerminalItem,
) {
  const terminals = terminalsByWorkspaceId[terminal.workspaceId] ?? [];
  if (terminals.some((item) => item.id === terminal.id)) {
    return terminalsByWorkspaceId;
  }

  return {
    ...terminalsByWorkspaceId,
    [terminal.workspaceId]: [terminal, ...terminals],
  };
}
