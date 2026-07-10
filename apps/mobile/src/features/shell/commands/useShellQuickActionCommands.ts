import { useMemo } from "react";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import type { OpenWorkspaceBrowserInput } from "./shell-action-builders";
import type { ShellCreateTerminalActionInput } from "./shell-create-terminal-domain";
import { useShellAgentQuickActions } from "./useShellAgentQuickActions";
import { useShellWorkspaceBrowserQuickActions } from "./useShellWorkspaceBrowserQuickActions";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseShellQuickActionCommandsInput = {
  createTerminal: (workspace: Workspace, input: ShellCreateTerminalActionInput) => void;
  openWorkspaceBrowser: (input: OpenWorkspaceBrowserInput) => void;
  screenContext: ShellScreenContext;
  shell: ShellState;
  t: Translate;
  terminalMessages: ShellTerminalMessages;
};

export function useShellQuickActionCommands({
  createTerminal,
  openWorkspaceBrowser,
  screenContext,
  shell,
  t,
  terminalMessages,
}: UseShellQuickActionCommandsInput) {
  const selectedWorkspace = screenContext.selectedWorkspace;
  const selectedWorkspaceBrowserContext = useMemo(
    () =>
      screenContext.selectedWorkspaceContext
        ? {
            activePreviewKind: shell.activePaneTab?.kind ?? null,
            activePreviewPath:
              shell.activePaneTab?.kind === "file" || shell.activePaneTab?.kind === "diff"
                ? shell.activePaneTab.path
                : null,
            nodeId: screenContext.selectedWorkspace?.nodeId ?? screenContext.selectedTerminal?.nodeId ?? null,
            organizationId: screenContext.selectedWorkspaceContext.organizationId,
            projectId: screenContext.selectedWorkspaceContext.projectId,
            projectLabel: screenContext.selectedProjectName,
            terminalId: screenContext.selectedTerminal?.id ?? null,
            terminalLabel: screenContext.selectedTerminal?.label ?? null,
            workspaceBranch: screenContext.selectedWorkspace?.branch ?? null,
            workspaceId: screenContext.selectedWorkspaceContext.workspaceId,
            workspaceLabel: screenContext.selectedWorkspaceLabel,
          }
        : null,
    [
      shell.activePaneTab,
      screenContext.selectedProjectName,
      screenContext.selectedTerminal?.id,
      screenContext.selectedTerminal?.label,
      screenContext.selectedTerminal?.nodeId,
      screenContext.selectedWorkspace?.branch,
      screenContext.selectedWorkspace?.nodeId,
      screenContext.selectedWorkspaceContext,
      screenContext.selectedWorkspaceLabel,
    ],
  );

  const { agentQuickActions, createTerminalHandler } = useShellAgentQuickActions({
    createTerminal,
    selectedWorkspace,
    t,
  });
  const { browserOpenHandler, openChangesHandler, openFilesHandler, openPullRequestsHandler } =
    useShellWorkspaceBrowserQuickActions({
      activePaneTabKind: shell.activePaneTab?.kind ?? null,
      openWorkspaceBrowser,
      selectedWorkspaceBrowserContext,
    });

  const refreshSessionsHandler = screenContext.selectedWorkspaceContext
    ? () => void terminalMessages.refreshSessionSync()
    : null;

  return {
    agentQuickActions,
    browserOpenHandler,
    createTerminalHandler,
    openChangesHandler,
    openFilesHandler,
    openPullRequestsHandler,
    refreshSessionsHandler,
  };
}
