import { useCallback } from "react";

import type { TerminalItem, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { generateId } from "@/helpers/generateId";
import { upsertWorkspaceTerminalStoreState } from "../state/shell-pane-state-machine";
import { DEFAULT_TERMINAL_MODEL_ID } from "../state/shell.constants";
import {
  buildCreatedTerminalItem,
  buildUniqueTerminalLabel,
  ensureTerminalInWorkspace,
  prependTerminalToWorkspace,
} from "./shell-terminal-selection-domain";

type StoredState = {
  setTerminalsByWorkspaceId: (
    updater: (current: Record<string, TerminalItem[]>) => Record<string, TerminalItem[]>,
  ) => void;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
};

type SyncWorkspaceSelectionState = (input: {
  includePreviewRoute?: boolean;
  nodeId: string | null;
  orgId: string;
  projectId: string;
  workspaceId: string;
  nextStoreState: WorkspacePaneStoreState;
}) => void;

export function useShellTerminalSelectionCommands({
  getWorkspacePaneStoreState,
  storedState,
  syncWorkspaceSelectionState,
  writeWorkspacePaneStoreState,
}: {
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  storedState: StoredState;
  syncWorkspaceSelectionState: SyncWorkspaceSelectionState;
  writeWorkspacePaneStoreState: (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => void;
}) {
  const createTerminal = useCallback(
    (input: {
      orgId: string;
      projectId: string;
      workspaceId: string;
      workspaceLabel: string;
      nodeId: string;
      label: string;
      agentKind?: TerminalItem["agentKind"];
      launchCommand?: string | null;
    }) => {
      const terminalId = generateId("terminal");
      const createdAt = new Date().toISOString();
      const label = buildUniqueTerminalLabel(storedState.terminalsByWorkspaceId[input.workspaceId] ?? [], input.label);
      const terminal = buildCreatedTerminalItem({
        agentKind: input.agentKind,
        createdAt,
        id: terminalId,
        label,
        launchCommand: input.launchCommand,
        modelId: DEFAULT_TERMINAL_MODEL_ID,
        nodeId: input.nodeId,
        orgId: input.orgId,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        workspaceLabel: input.workspaceLabel,
      });

      storedState.setTerminalsByWorkspaceId((current) => prependTerminalToWorkspace(current, terminal));

      const nextStoreState = upsertWorkspaceTerminalStoreState(
        getWorkspacePaneStoreState(input.workspaceId),
        input.workspaceId,
        {
          agentKind: terminal.agentKind,
          id: terminalId,
          label: terminal.label,
          launchCommand: terminal.launchCommand,
          userRenamed: terminal.userRenamed,
        },
      );
      writeWorkspacePaneStoreState(input.workspaceId, nextStoreState);
      syncWorkspaceSelectionState({
        nextStoreState,
        nodeId: input.nodeId,
        orgId: input.orgId,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      });

      return terminal;
    },
    [getWorkspacePaneStoreState, storedState, syncWorkspaceSelectionState, writeWorkspacePaneStoreState],
  );

  const ensureTerminal = useCallback(
    (terminal: TerminalItem) => {
      storedState.setTerminalsByWorkspaceId((current) => ensureTerminalInWorkspace(current, terminal));

      const nextStoreState = upsertWorkspaceTerminalStoreState(
        getWorkspacePaneStoreState(terminal.workspaceId),
        terminal.workspaceId,
        {
          agentKind: terminal.agentKind,
          id: terminal.id,
          label: terminal.label,
          launchCommand: terminal.launchCommand,
          session: terminal.session,
          userRenamed: terminal.userRenamed,
        },
      );
      writeWorkspacePaneStoreState(terminal.workspaceId, nextStoreState);
      syncWorkspaceSelectionState({
        nextStoreState,
        nodeId: terminal.nodeId ?? null,
        orgId: terminal.orgId,
        projectId: terminal.projectId,
        workspaceId: terminal.workspaceId,
      });
    },
    [getWorkspacePaneStoreState, storedState, syncWorkspaceSelectionState, writeWorkspacePaneStoreState],
  );

  return {
    createTerminal,
    ensureTerminal,
  };
}
