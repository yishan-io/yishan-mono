import { useCallback } from "react";

import { markClosedBackendSession } from "../state/shell-closed-backend-session-guard";
import type { TerminalItem } from "../state/shell.types";
import { stopRelayTerminalSession } from "./relay-terminal-sessions";
import { resetTerminalRuntimeSnapshot, resetTerminalSessionStartLease } from "./terminal-runtime-session-helpers";
import type { RuntimeSnapshot } from "./terminal-transport-controller-domain";

export function useTerminalCloseSessionCommand({
  accessToken,
  clearMeasuredSize,
  clearPendingStartTimeout,
  clearTerminalTransientState,
  deleteRuntimeSnapshot,
  detachTransport,
  peekRuntimeSnapshot,
  removeTerminal,
}: {
  accessToken: string | null;
  clearMeasuredSize: (terminalId: string) => void;
  clearPendingStartTimeout: (terminalId: string) => void;
  clearTerminalTransientState: (terminalId: string) => void;
  deleteRuntimeSnapshot: (terminalId: string) => void;
  detachTransport: (terminalId: string) => void;
  peekRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot | null;
  removeTerminal: (terminal: Pick<TerminalItem, "id" | "workspaceId">) => void;
}) {
  return useCallback(
    async (terminal: TerminalItem | null) => {
      if (!terminal) {
        return;
      }

      const snapshot = peekRuntimeSnapshot(terminal.id);
      detachTransport(terminal.id);
      if (snapshot) {
        resetTerminalRuntimeSnapshot(snapshot);
      }
      resetTerminalSessionStartLease(terminal.id);

      const sessionId = terminal.session?.sessionId;
      if (sessionId) {
        markClosedBackendSession(terminal.workspaceId, sessionId);
      }

      clearTerminalTransientState(terminal.id);
      clearMeasuredSize(terminal.id);
      deleteRuntimeSnapshot(terminal.id);
      clearPendingStartTimeout(terminal.id);
      removeTerminal(terminal);

      if (!sessionId || !accessToken) {
        return;
      }

      try {
        await stopRelayTerminalSession({
          accessToken,
          nodeId: terminal.nodeId,
          sessionId,
        });
      } catch {
        // Ignore stop failures after the terminal has already been removed locally.
      }
    },
    [
      accessToken,
      clearMeasuredSize,
      clearPendingStartTimeout,
      clearTerminalTransientState,
      deleteRuntimeSnapshot,
      detachTransport,
      peekRuntimeSnapshot,
      removeTerminal,
    ],
  );
}
