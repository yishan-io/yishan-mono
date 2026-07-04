import { useCallback } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { resolveTerminalRendererKind } from "../domain/shell-terminal-surface-domain";
import type { TerminalItem } from "../state/shell.types";
import { useTerminalMessageState } from "../terminal/useTerminalMessageState";
import { useTerminalSessionRuntime } from "../terminal/useTerminalSessionRuntime";
import { useWorkspaceTerminalLifecycleEvents } from "../terminal/useWorkspaceTerminalLifecycleEvents";
import { useWorkspaceTerminalSessionSync } from "../terminal/useWorkspaceTerminalSessionSync";

export function useShellTerminalMessages({
  hasRestoredStoredState,
  selectedTerminalWorkspace,
  selectedTerminalId,
  removeTerminal,
  syncWorkspaceTerminalTabs,
  terminalsByWorkspaceId,
  upsertTerminal,
  updateTerminal,
  workspaceLabel,
}: {
  hasRestoredStoredState: boolean;
  selectedTerminalWorkspace: {
    id: string;
    nodeId?: string | null;
    organizationId: string;
    projectId: string;
  } | null;
  selectedTerminalId: string | null;
  removeTerminal: (workspaceId: string, terminalId: string) => void;
  syncWorkspaceTerminalTabs: (input: {
    terminals: TerminalItem[];
    terminalIdsToRemove?: string[];
    workspace: {
      id: string;
      nodeId?: string | null;
      organizationId: string;
      projectId: string;
    };
    workspaceLabel: string | null;
  }) => void;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  upsertTerminal: (workspaceId: string, terminal: TerminalItem) => void;
  updateTerminal: (
    workspaceId: string,
    terminalId: string,
    updater: (terminal: TerminalItem) => TerminalItem | null,
  ) => void;
  workspaceLabel: string | null;
}) {
  const { session, status } = useAuth();
  const { t } = useAppLanguage();
  const accessToken = session?.accessToken ?? null;
  const shouldUseTerminalEmulator = useCallback(
    (terminal: TerminalItem | null) => resolveTerminalRendererKind(Platform.OS, terminal) === "xterm",
    [],
  );

  const patchTerminal = useCallback(
    (
      terminal: Pick<TerminalItem, "id" | "workspaceId">,
      patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
      options?: { touchUpdatedAt?: boolean },
    ) => {
      updateTerminal(terminal.workspaceId, terminal.id, (current) => ({
        ...current,
        ...patch,
        updatedAt: options?.touchUpdatedAt === false ? current.updatedAt : new Date().toISOString(),
      }));
    },
    [updateTerminal],
  );

  const messageState = useTerminalMessageState({ patchTerminal, shouldUseTerminalEmulator });
  const runtime = useTerminalSessionRuntime({
    accessToken,
    appendSystemMessage: messageState.appendSystemMessage,
    clearTerminalTransientState: messageState.clearTerminalTransientState,
    readDraftForTerminal: messageState.readDraftForTerminal,
    resetDraftForTerminal: messageState.resetDraftForTerminal,
    selectedTerminalId,
    setTerminalOutputById: messageState.setTerminalOutputById,
    status,
    terminalsByWorkspaceId,
    updateTerminal,
  });

  const sessionSync = useWorkspaceTerminalSessionSync({
    accessToken,
    enabled: hasRestoredStoredState,
    removeTerminal,
    syncWorkspaceTerminalTabs,
    status,
    t,
    terminalsByWorkspaceId,
    upsertTerminal,
    workspace: selectedTerminalWorkspace,
    workspaceLabel,
  });
  useWorkspaceTerminalLifecycleEvents({
    accessToken,
    enabled: hasRestoredStoredState,
    removeTerminal,
    syncWorkspaceTerminalTabs,
    t,
    terminalsByWorkspaceId,
    upsertTerminal,
    workspace: selectedTerminalWorkspace,
    workspaceLabel,
  });

  return {
    ...runtime,
    ...sessionSync,
    getDraft: messageState.getDraft,
    getMessages: messageState.getMessages,
    getOutput: messageState.getOutput,
    handleDraftChange: messageState.handleDraftChange,
  };
}

export type ShellTerminalMessages = ReturnType<typeof useShellTerminalMessages>;
