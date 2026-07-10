import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AuthStatus } from "@/features/auth";
import { getRelayBaseUrl } from "@/lib/config/env";
import { logMobileDebug, summarizeDebugError } from "@/lib/debug/mobileDebug";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { createRelayTerminalTransport } from "./relay-terminal-transport";
import type { TerminalTransport } from "./terminal-transport";
import {
  type RuntimeSnapshot,
  type TerminalMeasuredSize,
  canAttachTerminalTransport,
  createRuntimeSnapshot,
  shouldReuseTerminalTransport,
} from "./terminal-transport-controller-domain";
import { useTerminalTransportOutputBuffer } from "./useTerminalTransportOutputBuffer";

export function useTerminalTransportController({
  accessToken,
  appendSystemMessage,
  patchTerminal,
  setTerminalOutputById,
  status,
  terminalsByWorkspaceId,
}: {
  accessToken: string | null;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  patchTerminal: (
    terminal: Pick<TerminalItem, "id" | "workspaceId">,
    patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
    options?: { touchUpdatedAt?: boolean },
  ) => void;
  setTerminalOutputById: Dispatch<SetStateAction<Record<string, string>>>;
  status: AuthStatus;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
}) {
  const runtimeByTerminalIdRef = useRef<Record<string, RuntimeSnapshot>>({});
  const measuredSizeByTerminalIdRef = useRef<Record<string, TerminalMeasuredSize>>({});
  const pendingStartTimeoutByTerminalIdRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const transportByTerminalIdRef = useRef<Record<string, TerminalTransport>>({});

  const terminals = useMemo(() => Object.values(terminalsByWorkspaceId).flat(), [terminalsByWorkspaceId]);
  const terminalsById = useMemo(
    () => Object.fromEntries(terminals.map((terminal) => [terminal.id, terminal] as const)),
    [terminals],
  );

  const getRuntimeSnapshot = useCallback((terminalId: string): RuntimeSnapshot => {
    const existing = runtimeByTerminalIdRef.current[terminalId];
    if (existing) {
      return existing;
    }

    const created = createRuntimeSnapshot();
    runtimeByTerminalIdRef.current[terminalId] = created;
    return created;
  }, []);

  const peekRuntimeSnapshot = useCallback(
    (terminalId: string) => runtimeByTerminalIdRef.current[terminalId] ?? null,
    [],
  );

  const { appendTerminalOutput, applyTerminalExit, applyTerminalOutput } = useTerminalTransportOutputBuffer({
    appendSystemMessage,
    getRuntimeSnapshot,
    patchTerminal,
    setTerminalOutputById,
    terminals,
  });

  const detachTransport = useCallback((terminalId: string) => {
    const existing = transportByTerminalIdRef.current[terminalId];
    if (existing) {
      existing.dispose();
      delete transportByTerminalIdRef.current[terminalId];
    }

    const snapshot = runtimeByTerminalIdRef.current[terminalId];
    if (snapshot) {
      snapshot.transportSessionId = null;
    }
  }, []);

  const clearPendingStartTimeout = useCallback((terminalId: string) => {
    const handle = pendingStartTimeoutByTerminalIdRef.current[terminalId];
    if (!handle) {
      return;
    }

    clearTimeout(handle);
    delete pendingStartTimeoutByTerminalIdRef.current[terminalId];
  }, []);

  const hasPendingStartTimeout = useCallback(
    (terminalId: string) => !!pendingStartTimeoutByTerminalIdRef.current[terminalId],
    [],
  );

  const setPendingStartTimeout = useCallback((terminalId: string, handle: ReturnType<typeof setTimeout>) => {
    pendingStartTimeoutByTerminalIdRef.current[terminalId] = handle;
  }, []);

  const getMeasuredSize = useCallback(
    (terminalId: string) => measuredSizeByTerminalIdRef.current[terminalId] ?? null,
    [],
  );

  const setMeasuredSize = useCallback((terminalId: string, size: TerminalMeasuredSize) => {
    measuredSizeByTerminalIdRef.current[terminalId] = size;
  }, []);

  const clearMeasuredSize = useCallback((terminalId: string) => {
    delete measuredSizeByTerminalIdRef.current[terminalId];
  }, []);

  const deleteRuntimeSnapshot = useCallback((terminalId: string) => {
    delete runtimeByTerminalIdRef.current[terminalId];
  }, []);

  const getRuntimeTerminalIds = useCallback(() => Object.keys(runtimeByTerminalIdRef.current), []);
  const getTransportTerminalIds = useCallback(() => Object.keys(transportByTerminalIdRef.current), []);

  const attachTransport = useCallback(
    (terminal: TerminalItem, sessionId: string): TerminalTransport | null => {
      const transportAccessToken = accessToken;
      if (
        !canAttachTerminalTransport({ accessToken: transportAccessToken, sessionId, status }) ||
        !transportAccessToken
      ) {
        return null;
      }

      const snapshot = getRuntimeSnapshot(terminal.id);
      const existing = transportByTerminalIdRef.current[terminal.id];
      if (shouldReuseTerminalTransport(Boolean(existing), snapshot.transportSessionId, sessionId)) {
        return existing ?? null;
      }

      detachTransport(terminal.id);
      const nodeId = terminal.nodeId?.trim();
      if (!nodeId) {
        return null;
      }

      const transport = createRelayTerminalTransport({
        accessToken: transportAccessToken,
        handlers: {
          onError: (error) => {
            const currentSnapshot = getRuntimeSnapshot(terminal.id);
            currentSnapshot.exited = false;
            detachTransport(terminal.id);
            logMobileDebug("terminal.transport", "error", {
              error: summarizeDebugError(error),
              sessionId,
              terminalId: terminal.id,
              workspaceId: terminal.workspaceId,
            });
            patchTerminal(terminal, { status: "error" }, { touchUpdatedAt: false });
          },
          onExit: (exitCode) => {
            applyTerminalExit(terminal, sessionId, exitCode);
          },
          onOutput: (output) => {
            appendTerminalOutput(terminal, sessionId, output);
          },
          onSnapshot: (snapshotOutput) => {
            applyTerminalOutput(terminal, sessionId, snapshotOutput);
          },
        },
        nodeId,
        relayUrl: getRelayBaseUrl(),
        sessionId,
      });

      transportByTerminalIdRef.current[terminal.id] = transport;
      snapshot.transportSessionId = sessionId;
      return transport;
    },
    [
      accessToken,
      appendTerminalOutput,
      applyTerminalExit,
      applyTerminalOutput,
      detachTransport,
      getRuntimeSnapshot,
      patchTerminal,
      status,
    ],
  );

  return {
    attachTransport,
    clearPendingStartTimeout,
    clearMeasuredSize,
    detachTransport,
    deleteRuntimeSnapshot,
    getMeasuredSize,
    getRuntimeSnapshot,
    peekRuntimeSnapshot,
    getRuntimeTerminalIds,
    getTransportTerminalIds,
    hasPendingStartTimeout,
    setMeasuredSize,
    setPendingStartTimeout,
    terminals,
    terminalsById,
  };
}
