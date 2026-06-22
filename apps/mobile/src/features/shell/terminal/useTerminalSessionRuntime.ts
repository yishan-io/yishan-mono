import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AuthStatus } from "@/features/auth";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { useTerminalRuntimeInteractionHandlers } from "./useTerminalRuntimeInteractionHandlers";
import { useTerminalRuntimeLifecycle } from "./useTerminalRuntimeLifecycle";
import { useTerminalRuntimeSessionCommands } from "./useTerminalRuntimeSessionCommands";
import { useTerminalTransportController } from "./useTerminalTransportController";

export function useTerminalSessionRuntime({
  accessToken,
  appendSystemMessage,
  clearTerminalTransientState,
  readDraftForTerminal,
  resetDraftForTerminal,
  selectedTerminalId,
  setTerminalOutputById,
  status,
  terminalsByWorkspaceId,
  updateTerminal,
}: {
  accessToken: string | null;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  clearTerminalTransientState: (terminalId: string) => void;
  readDraftForTerminal: (terminalId: string) => string;
  resetDraftForTerminal: (terminalId: string) => void;
  selectedTerminalId: string | null;
  setTerminalOutputById: Dispatch<SetStateAction<Record<string, string>>>;
  status: AuthStatus;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  updateTerminal: (
    workspaceId: string,
    terminalId: string,
    updater: (terminal: TerminalItem) => TerminalItem | null,
  ) => void;
}) {
  const patchTerminal = useCallback(
    (
      terminal: Pick<TerminalItem, "id" | "workspaceId">,
      patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
      options?: { touchUpdatedAt?: boolean },
    ) => {
      updateTerminal(terminal.workspaceId, terminal.id, (current) => {
        const touchUpdatedAt = options?.touchUpdatedAt !== false;
        const hasPatchChanges = Object.entries(patch).some(
          ([key, value]) => current[key as keyof TerminalItem] !== value,
        );
        if (!hasPatchChanges && !touchUpdatedAt) {
          return current;
        }

        const nextUpdatedAt = touchUpdatedAt ? new Date().toISOString() : current.updatedAt;
        if (!hasPatchChanges && nextUpdatedAt === current.updatedAt) {
          return current;
        }

        return {
          ...current,
          ...patch,
          updatedAt: nextUpdatedAt,
        };
      });
    },
    [updateTerminal],
  );

  const removeTerminal = useCallback(
    (terminal: Pick<TerminalItem, "id" | "workspaceId">) => {
      updateTerminal(terminal.workspaceId, terminal.id, () => null);
    },
    [updateTerminal],
  );

  const {
    attachTransport,
    clearPendingStartTimeout,
    clearMeasuredSize,
    detachTransport,
    deleteRuntimeSnapshot,
    getMeasuredSize,
    getRuntimeSnapshot,
    getRuntimeTerminalIds,
    getTransportTerminalIds,
    hasPendingStartTimeout,
    peekRuntimeSnapshot,
    restoreTerminalOutput,
    setMeasuredSize,
    setPendingStartTimeout,
    terminals,
    terminalsById,
  } = useTerminalTransportController({
    accessToken,
    appendSystemMessage,
    patchTerminal,
    setTerminalOutputById,
    status,
    terminalsByWorkspaceId,
  });

  const { attachOrCreateTerminalSession, closeTerminal, scheduleTerminalStart } = useTerminalRuntimeSessionCommands({
    accessToken,
    appendSystemMessage,
    attachTransport,
    clearMeasuredSize,
    clearPendingStartTimeout,
    clearTerminalTransientState,
    deleteRuntimeSnapshot,
    detachTransport,
    getMeasuredSize,
    getRuntimeSnapshot,
    hasPendingStartTimeout,
    patchTerminal,
    peekRuntimeSnapshot,
    removeTerminal,
    restoreTerminalOutput,
    setPendingStartTimeout,
    status,
  });

  useTerminalRuntimeLifecycle({
    accessToken,
    attachTransport,
    attachOrCreateTerminalSession,
    clearMeasuredSize,
    clearPendingStartTimeout,
    clearTerminalTransientState,
    deleteRuntimeSnapshot,
    detachTransport,
    getRuntimeSnapshot,
    getRuntimeTerminalIds,
    getTransportTerminalIds,
    scheduleTerminalStart,
    selectedTerminalId,
    status,
    terminals,
    terminalsById,
  });

  const { handleSend, handleTerminalInput, handleTerminalResize } = useTerminalRuntimeInteractionHandlers({
    accessToken,
    attachOrCreateTerminalSession,
    appendSystemMessage,
    attachTransport,
    patchTerminal,
    readDraftForTerminal,
    resetDraftForTerminal,
    setMeasuredSize,
  });

  return {
    closeTerminal: (terminal: TerminalItem | null) => {
      void closeTerminal(terminal);
    },
    handleSend: (selectedTerminal: TerminalItem | null) => {
      void handleSend(selectedTerminal);
    },
    handleTerminalInput: (data: string, selectedTerminal: TerminalItem | null) => {
      void handleTerminalInput(data, selectedTerminal);
    },
    handleTerminalResize: (size: { cols: number; rows: number }, selectedTerminal: TerminalItem | null) => {
      void handleTerminalResize(size, selectedTerminal);
    },
  };
}
