import { useCallback } from "react";

import type { AuthStatus } from "@/features/auth";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import type { TerminalTransport } from "./terminal-transport";
import type { TerminalMeasuredSize } from "./terminal-transport-controller-domain";
import { useTerminalAttachOrCreateSessionCommand } from "./useTerminalAttachOrCreateSessionCommand";
import { useTerminalCloseSessionCommand } from "./useTerminalCloseSessionCommand";

type TerminalPatchFn = (
  terminal: Pick<TerminalItem, "id" | "workspaceId">,
  patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
  options?: { touchUpdatedAt?: boolean },
) => void;

export function useTerminalRuntimeSessionCommands({
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
  status,
  setPendingStartTimeout,
}: {
  accessToken: string | null;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  attachTransport: (terminal: TerminalItem, sessionId: string) => TerminalTransport | null;
  clearMeasuredSize: (terminalId: string) => void;
  clearPendingStartTimeout: (terminalId: string) => void;
  clearTerminalTransientState: (terminalId: string) => void;
  deleteRuntimeSnapshot: (terminalId: string) => void;
  detachTransport: (terminalId: string) => void;
  getMeasuredSize: (terminalId: string) => TerminalMeasuredSize | null;
  getRuntimeSnapshot: (terminalId: string) => {
    ensuredSessionId: string | null;
    ensuring: boolean;
    exited: boolean;
    starting: boolean;
    transportSessionId: string | null;
  };
  hasPendingStartTimeout: (terminalId: string) => boolean;
  patchTerminal: TerminalPatchFn;
  peekRuntimeSnapshot: (terminalId: string) => {
    ensuredSessionId: string | null;
    ensuring: boolean;
    exited: boolean;
    starting: boolean;
    transportSessionId: string | null;
  } | null;
  removeTerminal: (terminal: Pick<TerminalItem, "id" | "workspaceId">) => void;
  restoreTerminalOutput: (
    terminal: TerminalItem,
    sessionId: string,
    output: {
      output: string;
      running: boolean;
      exitCode?: number | null;
    },
  ) => void;
  status: AuthStatus;
  setPendingStartTimeout: (terminalId: string, handle: ReturnType<typeof setTimeout>) => void;
}) {
  const attachOrCreateTerminalSession = useTerminalAttachOrCreateSessionCommand({
    accessToken,
    appendSystemMessage,
    attachTransport,
    getRuntimeSnapshot,
    peekRuntimeSnapshot,
    patchTerminal,
    restoreTerminalOutput,
    status,
  });

  const scheduleTerminalStart = useCallback(
    (terminal: TerminalItem) => {
      const measuredSize = getMeasuredSize(terminal.id);
      if (measuredSize) {
        void attachOrCreateTerminalSession(terminal, measuredSize);
        return;
      }

      if (hasPendingStartTimeout(terminal.id)) {
        return;
      }

      setPendingStartTimeout(
        terminal.id,
        setTimeout(() => {
          clearPendingStartTimeout(terminal.id);
          void attachOrCreateTerminalSession(terminal, getMeasuredSize(terminal.id));
        }, 160),
      );
    },
    [
      attachOrCreateTerminalSession,
      clearPendingStartTimeout,
      getMeasuredSize,
      hasPendingStartTimeout,
      setPendingStartTimeout,
    ],
  );

  const closeTerminal = useTerminalCloseSessionCommand({
    accessToken,
    clearMeasuredSize,
    clearPendingStartTimeout,
    clearTerminalTransientState,
    deleteRuntimeSnapshot,
    detachTransport,
    peekRuntimeSnapshot,
    removeTerminal,
  });

  return {
    attachOrCreateTerminalSession,
    closeTerminal,
    scheduleTerminalStart,
  };
}
