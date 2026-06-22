import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import type { RuntimeSnapshot } from "./terminal-transport-controller-domain";
import {
  buildExitedTerminalRuntimePatch,
  buildTrimmedTerminalOutput,
  mergePendingTerminalOutputMap,
} from "./terminal-transport-output-domain";
import {
  appendTerminalOutputRuntime,
  deleteTerminalOutputRuntime,
  listTerminalOutputRuntimeIds,
  readTerminalOutputRuntimeSnapshot,
  replaceTerminalOutputRuntime,
} from "./terminalOutputRuntimeRegistry";

export function useTerminalTransportOutputBuffer({
  appendSystemMessage,
  getRuntimeSnapshot,
  patchTerminal,
  setTerminalOutputById,
  terminals,
}: {
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  getRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot;
  patchTerminal: (
    terminal: Pick<TerminalItem, "id" | "workspaceId">,
    patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
    options?: { touchUpdatedAt?: boolean },
  ) => void;
  setTerminalOutputById: Dispatch<SetStateAction<Record<string, string>>>;
  terminals: TerminalItem[];
}) {
  const pendingOutputByTerminalIdRef = useRef<Record<string, string>>({});
  const pendingRuntimePatchByTerminalIdRef = useRef<
    Record<
      string,
      {
        exitCode?: number | null;
        output: string;
        running: boolean;
        terminal: TerminalItem;
      }
    >
  >({});
  const pendingOutputFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingTerminalOutput = useCallback(() => {
    pendingOutputFlushTimeoutRef.current = null;

    const pendingOutputByTerminalId = pendingOutputByTerminalIdRef.current;
    pendingOutputByTerminalIdRef.current = {};

    if (Object.keys(pendingOutputByTerminalId).length > 0) {
      setTerminalOutputById((current) => mergePendingTerminalOutputMap(current, pendingOutputByTerminalId));
    }

    const pendingRuntimePatchByTerminalId = pendingRuntimePatchByTerminalIdRef.current;
    pendingRuntimePatchByTerminalIdRef.current = {};

    for (const { exitCode, output, running, terminal } of Object.values(pendingRuntimePatchByTerminalId)) {
      if (!running) {
        patchTerminal(terminal, buildExitedTerminalRuntimePatch(terminal, output), { touchUpdatedAt: false });
      }

      if (!running && exitCode !== undefined && exitCode !== null) {
        appendSystemMessage(terminal.id, `Process exited with code ${exitCode}.`);
      }
    }
  }, [appendSystemMessage, patchTerminal, setTerminalOutputById]);

  const schedulePendingTerminalOutputFlush = useCallback(() => {
    if (pendingOutputFlushTimeoutRef.current) {
      return;
    }

    pendingOutputFlushTimeoutRef.current = setTimeout(() => {
      flushPendingTerminalOutput();
    }, 16);
  }, [flushPendingTerminalOutput]);

  const applyTerminalOutput = useCallback(
    (
      terminal: TerminalItem,
      sessionId: string,
      output: { output: string; running: boolean; exitCode?: number | null; replace?: boolean },
    ) => {
      const snapshot = getRuntimeSnapshot(terminal.id);
      snapshot.ensuredSessionId = sessionId;
      snapshot.exited = !output.running;

      const previousOutput = readTerminalOutputRuntimeSnapshot(terminal.id, terminal.cachedOutput ?? "");
      const nextRawOutput = buildTrimmedTerminalOutput(previousOutput, output.output, output.replace);
      const nextAppendedChunk = nextRawOutput.startsWith(previousOutput)
        ? nextRawOutput.slice(previousOutput.length)
        : null;
      if (output.replace) {
        replaceTerminalOutputRuntime(terminal.id, nextRawOutput);
      } else if (nextAppendedChunk === null) {
        replaceTerminalOutputRuntime(terminal.id, nextRawOutput);
      } else {
        appendTerminalOutputRuntime(terminal.id, nextAppendedChunk, terminal.cachedOutput ?? "");
      }
      pendingOutputByTerminalIdRef.current[terminal.id] = nextRawOutput;
      pendingRuntimePatchByTerminalIdRef.current[terminal.id] = {
        exitCode: output.exitCode,
        output: nextRawOutput,
        running: output.running,
        terminal,
      };
      schedulePendingTerminalOutputFlush();
    },
    [getRuntimeSnapshot, schedulePendingTerminalOutputFlush],
  );

  useEffect(() => {
    const existingTerminalIds = new Set(terminals.map((terminal) => terminal.id));
    for (const terminalId of listTerminalOutputRuntimeIds()) {
      if (!existingTerminalIds.has(terminalId)) {
        deleteTerminalOutputRuntime(terminalId);
        delete pendingOutputByTerminalIdRef.current[terminalId];
        delete pendingRuntimePatchByTerminalIdRef.current[terminalId];
      }
    }

    setTerminalOutputById((current) => {
      let changed = false;
      const next = { ...current };

      for (const terminal of terminals) {
        const output = readTerminalOutputRuntimeSnapshot(terminal.id, terminal.cachedOutput ?? "");
        if (next[terminal.id] === output) {
          continue;
        }

        next[terminal.id] = output;
        changed = true;
      }

      for (const terminalId of Object.keys(next)) {
        if (existingTerminalIds.has(terminalId)) {
          continue;
        }

        delete next[terminalId];
        changed = true;
      }

      return changed ? next : current;
    });
  }, [setTerminalOutputById, terminals]);

  useEffect(
    () => () => {
      if (pendingOutputFlushTimeoutRef.current) {
        clearTimeout(pendingOutputFlushTimeoutRef.current);
        pendingOutputFlushTimeoutRef.current = null;
      }
    },
    [],
  );

  return {
    applyTerminalOutput,
    readTerminalOutput: (terminal: TerminalItem) =>
      pendingOutputByTerminalIdRef.current[terminal.id] ??
      readTerminalOutputRuntimeSnapshot(terminal.id, terminal.cachedOutput ?? ""),
  };
}
