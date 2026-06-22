import { useMemo } from "react";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import { buildAgentQuickActions } from "./shell-action-builders";
import type { ShellCreateTerminalActionInput } from "./shell-create-terminal-domain";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellAgentQuickActions({
  createTerminal,
  selectedWorkspace,
  t,
}: {
  createTerminal: (workspace: Workspace, input: ShellCreateTerminalActionInput) => void;
  selectedWorkspace: Workspace | null;
  t: Translate;
}) {
  const createTerminalHandler = selectedWorkspace
    ? () => createTerminal(selectedWorkspace, { label: t("shell.newTerminal") })
    : null;

  const agentQuickActions = useMemo(() => {
    if (!selectedWorkspace) {
      return null;
    }

    return buildAgentQuickActions({
      labels: {
        claude: t("shell.agentClaude"),
        codex: t("shell.agentCodex"),
        opencode: t("shell.agentOpenCode"),
      },
      onCreateTerminal: createTerminal,
      workspace: selectedWorkspace,
    });
  }, [createTerminal, selectedWorkspace, t]);

  return {
    agentQuickActions,
    createTerminalHandler,
  };
}
