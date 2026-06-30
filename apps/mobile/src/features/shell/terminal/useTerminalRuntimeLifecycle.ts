import { useEffect, useRef } from "react";

import type { AuthStatus } from "@/features/auth";
import type { TerminalItem } from "../state/shell.types";
import {
  classifyTerminalRuntimeCleanup,
  resolveSelectedTerminalRuntimeAction,
} from "./terminal-runtime-lifecycle-domain";
import type { TerminalTransport } from "./terminal-transport";

export function useTerminalRuntimeLifecycle({
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
}: {
  accessToken: string | null;
  attachTransport: (terminal: TerminalItem, sessionId: string) => TerminalTransport | null;
  attachOrCreateTerminalSession: (terminal: TerminalItem) => Promise<void>;
  clearMeasuredSize: (terminalId: string) => void;
  clearPendingStartTimeout: (terminalId: string) => void;
  clearTerminalTransientState: (terminalId: string) => void;
  deleteRuntimeSnapshot: (terminalId: string) => void;
  detachTransport: (terminalId: string) => void;
  getRuntimeSnapshot: (terminalId: string) => {
    ensuredSessionId: string | null;
  };
  getRuntimeTerminalIds: () => string[];
  getTransportTerminalIds: () => string[];
  scheduleTerminalStart: (terminal: TerminalItem) => void;
  selectedTerminalId: string | null;
  status: AuthStatus;
  terminals: TerminalItem[];
  terminalsById: Record<string, TerminalItem>;
}) {
  const clearMeasuredSizeRef = useRef(clearMeasuredSize);
  const clearPendingStartTimeoutRef = useRef(clearPendingStartTimeout);
  const deleteRuntimeSnapshotRef = useRef(deleteRuntimeSnapshot);
  const detachTransportRef = useRef(detachTransport);
  const getRuntimeTerminalIdsRef = useRef(getRuntimeTerminalIds);
  const getTransportTerminalIdsRef = useRef(getTransportTerminalIds);

  clearMeasuredSizeRef.current = clearMeasuredSize;
  clearPendingStartTimeoutRef.current = clearPendingStartTimeout;
  deleteRuntimeSnapshotRef.current = deleteRuntimeSnapshot;
  detachTransportRef.current = detachTransport;
  getRuntimeTerminalIdsRef.current = getRuntimeTerminalIds;
  getTransportTerminalIdsRef.current = getTransportTerminalIds;

  useEffect(() => {
    const existingTerminalIds = new Set(terminals.map((terminal) => terminal.id));
    const selectedAction = resolveSelectedTerminalRuntimeAction({
      accessToken,
      getRuntimeSnapshot,
      selectedTerminalId,
      status,
      terminalsById,
    });

    if (selectedAction.kind === "attach-or-create") {
      void attachOrCreateTerminalSession(selectedAction.terminal);
    } else if (selectedAction.kind === "connect-transport") {
      attachTransport(selectedAction.terminal, selectedAction.sessionId)?.connect();
    } else if (selectedAction.kind === "schedule-start") {
      scheduleTerminalStart(selectedAction.terminal);
    }

    const { staleTerminalIds } = classifyTerminalRuntimeCleanup({
      existingTerminalIds,
      runtimeTerminalIds: getRuntimeTerminalIds(),
    });

    for (const terminalId of staleTerminalIds) {
      clearPendingStartTimeout(terminalId);
      detachTransport(terminalId);
      clearTerminalTransientState(terminalId);
      clearMeasuredSize(terminalId);
      deleteRuntimeSnapshot(terminalId);
    }
  }, [
    accessToken,
    attachTransport,
    attachOrCreateTerminalSession,
    clearPendingStartTimeout,
    clearMeasuredSize,
    clearTerminalTransientState,
    deleteRuntimeSnapshot,
    detachTransport,
    getRuntimeSnapshot,
    getRuntimeTerminalIds,
    scheduleTerminalStart,
    selectedTerminalId,
    status,
    terminals,
    terminalsById,
  ]);

  useEffect(
    () => () => {
      const runtimeTerminalIds = getRuntimeTerminalIdsRef.current();
      const transportTerminalIds = getTransportTerminalIdsRef.current();

      for (const terminalId of runtimeTerminalIds) {
        clearPendingStartTimeoutRef.current(terminalId);
      }

      for (const terminalId of transportTerminalIds) {
        detachTransportRef.current(terminalId);
      }

      for (const terminalId of runtimeTerminalIds) {
        clearMeasuredSizeRef.current(terminalId);
        deleteRuntimeSnapshotRef.current(terminalId);
      }
    },
    [],
  );
}
