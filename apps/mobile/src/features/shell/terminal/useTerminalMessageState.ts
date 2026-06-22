import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import {
  clearTerminalOutputRuntime,
  deleteTerminalOutputRuntime,
  readTerminalOutputRuntimeSnapshot,
} from "./terminalOutputRuntimeRegistry";

type TerminalDraftsState = Record<string, string>;
type TerminalMessagesState = Record<string, TerminalMessage[]>;
type TerminalOutputState = Record<string, string>;

const MAX_TERMINAL_MESSAGES = 64;

export function useTerminalMessageState({
  patchTerminal,
}: {
  patchTerminal: (
    terminal: Pick<TerminalItem, "id" | "workspaceId">,
    patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
    options?: { touchUpdatedAt?: boolean },
  ) => void;
}) {
  const usesTerminalEmulator = Platform.OS !== "web";
  const [terminalMessagesById, setTerminalMessagesById] = useState<TerminalMessagesState>({});
  const [terminalOutputById, setTerminalOutputById] = useState<TerminalOutputState>({});
  const [terminalDraftsById, setTerminalDraftsById] = useState<TerminalDraftsState>({});
  const [emptyTerminalDraft, setEmptyTerminalDraft] = useState("");
  const messageSequenceRef = useRef(0);

  const appendMessage = useCallback((terminalId: string, message: TerminalMessage) => {
    setTerminalMessagesById((current) => ({
      ...current,
      [terminalId]: [...(current[terminalId] ?? []), message].slice(-MAX_TERMINAL_MESSAGES),
    }));
  }, []);

  const clearTerminalTransientState = useCallback((terminalId: string) => {
    deleteTerminalOutputRuntime(terminalId);
    setTerminalMessagesById((current) => {
      if (!(terminalId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[terminalId];
      return next;
    });

    setTerminalDraftsById((current) => {
      if (!(terminalId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[terminalId];
      return next;
    });

    setTerminalOutputById((current) => {
      if (!(terminalId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[terminalId];
      return next;
    });
  }, []);

  const appendSystemMessage = useCallback(
    (terminalId: string, text: string, status: TerminalMessage["status"] = "completed") => {
      const sequence = messageSequenceRef.current++;
      appendMessage(terminalId, {
        createdAt: new Date().toISOString(),
        id: `system-${terminalId}-${Date.now()}-${sequence}`,
        parts: [{ text, type: "text" }],
        role: "system",
        status,
      });
    },
    [appendMessage],
  );

  const clearTerminalOutput = useCallback(
    (terminal: Pick<TerminalItem, "id" | "workspaceId">) => {
      clearTerminalOutputRuntime(terminal.id);
      setTerminalOutputById((current) => {
        if (!(terminal.id in current)) {
          return current;
        }

        const next = { ...current };
        delete next[terminal.id];
        return next;
      });

      patchTerminal(
        terminal,
        {
          cachedOutput: null,
        },
        { touchUpdatedAt: false },
      );
    },
    [patchTerminal],
  );

  const getMessages = useCallback(
    (selectedTerminal: TerminalItem | null): TerminalMessage[] => {
      if (!selectedTerminal) {
        return [];
      }

      return terminalMessagesById[selectedTerminal.id] ?? [];
    },
    [terminalMessagesById],
  );

  const getDraft = useCallback(
    (selectedTerminal: TerminalItem | null): string => {
      if (selectedTerminal) {
        return terminalDraftsById[selectedTerminal.id] ?? "";
      }

      return emptyTerminalDraft;
    },
    [emptyTerminalDraft, terminalDraftsById],
  );

  const getOutput = useCallback(
    (selectedTerminal: TerminalItem | null): string => {
      if (!selectedTerminal) {
        return "";
      }

      if (usesTerminalEmulator) {
        return (
          terminalOutputById[selectedTerminal.id] ??
          readTerminalOutputRuntimeSnapshot(selectedTerminal.id, selectedTerminal.cachedOutput ?? "")
        );
      }

      return terminalOutputById[selectedTerminal.id] ?? selectedTerminal.cachedOutput ?? "";
    },
    [terminalOutputById, usesTerminalEmulator],
  );

  const handleDraftChange = useCallback((value: string, selectedTerminal: TerminalItem | null) => {
    if (selectedTerminal) {
      setTerminalDraftsById((current) => ({ ...current, [selectedTerminal.id]: value }));
      return;
    }

    setEmptyTerminalDraft(value);
  }, []);

  const readDraftForTerminal = useCallback(
    (terminalId: string) => terminalDraftsById[terminalId] ?? "",
    [terminalDraftsById],
  );

  const resetDraftForTerminal = useCallback((terminalId: string) => {
    setTerminalDraftsById((current) => {
      if (!(terminalId in current) || current[terminalId] === "") {
        return current;
      }

      return { ...current, [terminalId]: "" };
    });
  }, []);

  return {
    appendSystemMessage,
    clearTerminalOutput,
    clearTerminalTransientState,
    getDraft,
    getMessages,
    getOutput,
    handleDraftChange,
    readDraftForTerminal,
    resetDraftForTerminal,
    setTerminalOutputById,
  };
}
