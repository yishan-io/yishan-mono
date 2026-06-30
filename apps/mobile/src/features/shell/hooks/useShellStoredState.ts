import { updateTerminalMap, upsertTerminalMap } from "@/features/shell/state/shell-stored-state-helpers";
import type {
  ShellWorkspaceTabState,
  TerminalItem,
  WorkspacePaneLayoutState,
} from "@/features/shell/state/shell.types";
import {
  setShellSessionPaneLayoutByWorkspaceId,
  setShellSessionTerminalsByWorkspaceId,
  setShellSessionWorkspaceTabStateByWorkspaceId,
  useShellSessionState,
} from "@/features/shell/state/shellSessionStore";
import { setShellSessionSelectedNodeIdByOrganization } from "@/features/shell/state/shellSessionStore";
import { useCallback, useMemo } from "react";
import { useShellStoredStatePersistence } from "./useShellStoredStatePersistence";
import { useShellStoredStateRestore } from "./useShellStoredStateRestore";

export type ShellStoredState = {
  hasRestoredStoredState: boolean;
  paneLayoutByWorkspaceId: Record<string, WorkspacePaneLayoutState>;
  selectedNodeIdByOrganization: Record<string, string>;
  setPaneLayoutByWorkspaceId: (
    next:
      | Record<string, WorkspacePaneLayoutState>
      | ((current: Record<string, WorkspacePaneLayoutState>) => Record<string, WorkspacePaneLayoutState>),
  ) => void;
  setSelectedNodeIdByOrganization: (
    next: Record<string, string> | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  setTerminalsByWorkspaceId: (
    next:
      | Record<string, TerminalItem[]>
      | ((current: Record<string, TerminalItem[]>) => Record<string, TerminalItem[]>),
  ) => void;
  setWorkspaceTabStateByWorkspaceId: (
    next:
      | Record<string, ShellWorkspaceTabState>
      | ((current: Record<string, ShellWorkspaceTabState>) => Record<string, ShellWorkspaceTabState>),
  ) => void;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  updateTerminal: (
    workspaceId: string,
    terminalId: string,
    updater: (terminal: TerminalItem) => TerminalItem | null,
  ) => void;
  upsertTerminal: (workspaceId: string, nextTerminal: TerminalItem) => void;
  workspaceTabStateByWorkspaceId: Record<string, ShellWorkspaceTabState>;
};

/** Owns shell state restore and persisted save scheduling for shell-local state. */
export function useShellStoredState(): ShellStoredState {
  const {
    hasRestoredStoredState,
    paneLayoutByWorkspaceId,
    selectedNodeIdByOrganization,
    terminalsByWorkspaceId,
    workspaceTabStateByWorkspaceId,
  } = useShellSessionState();

  const updateTerminal = useCallback(
    (workspaceId: string, terminalId: string, updater: (terminal: TerminalItem) => TerminalItem | null) => {
      setShellSessionTerminalsByWorkspaceId((current) => updateTerminalMap(current, workspaceId, terminalId, updater));
    },
    [],
  );

  const upsertTerminal = useCallback((workspaceId: string, nextTerminal: TerminalItem) => {
    setShellSessionTerminalsByWorkspaceId((current) => upsertTerminalMap(current, workspaceId, nextTerminal));
  }, []);

  useShellStoredStateRestore();
  useShellStoredStatePersistence({
    hasRestoredStoredState,
    paneLayoutByWorkspaceId,
    selectedNodeIdByOrganization,
    terminalsByWorkspaceId,
    workspaceTabStateByWorkspaceId,
  });

  return useMemo(
    () => ({
      hasRestoredStoredState,
      paneLayoutByWorkspaceId,
      selectedNodeIdByOrganization,
      terminalsByWorkspaceId,
      upsertTerminal,
      updateTerminal,
      setPaneLayoutByWorkspaceId: setShellSessionPaneLayoutByWorkspaceId,
      setSelectedNodeIdByOrganization: setShellSessionSelectedNodeIdByOrganization,
      setTerminalsByWorkspaceId: setShellSessionTerminalsByWorkspaceId,
      setWorkspaceTabStateByWorkspaceId: setShellSessionWorkspaceTabStateByWorkspaceId,
      workspaceTabStateByWorkspaceId,
    }),
    [
      hasRestoredStoredState,
      paneLayoutByWorkspaceId,
      selectedNodeIdByOrganization,
      terminalsByWorkspaceId,
      upsertTerminal,
      updateTerminal,
      workspaceTabStateByWorkspaceId,
    ],
  );
}
