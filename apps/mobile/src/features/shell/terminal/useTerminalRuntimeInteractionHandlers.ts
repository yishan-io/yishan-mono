import { useCallback } from "react";

import { getErrorMessage } from "@/helpers/errorHelpers";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import { formatTerminalCommandTitle } from "./terminal-title-utils";
import type { TerminalTransport } from "./terminal-transport";

type TerminalPatchFn = (
  terminal: Pick<TerminalItem, "id" | "workspaceId">,
  patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
  options?: { touchUpdatedAt?: boolean },
) => void;

export function useTerminalRuntimeInteractionHandlers({
  accessToken,
  attachOrCreateTerminalSession,
  appendSystemMessage,
  attachTransport,
  patchTerminal,
  readDraftForTerminal,
  resetDraftForTerminal,
  setMeasuredSize,
}: {
  accessToken: string | null;
  attachOrCreateTerminalSession: (
    terminal: TerminalItem,
    initialSize?: { cols: number; rows: number } | null,
  ) => Promise<void>;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  attachTransport: (terminal: TerminalItem, sessionId: string) => TerminalTransport | null;
  patchTerminal: TerminalPatchFn;
  readDraftForTerminal: (terminalId: string) => string;
  resetDraftForTerminal: (terminalId: string) => void;
  setMeasuredSize: (terminalId: string, size: { cols: number; rows: number }) => void;
}) {
  const handleSend = useCallback(
    async (selectedTerminal: TerminalItem | null, draftOverride?: string) => {
      if (!selectedTerminal) {
        return;
      }

      const draftSource = draftOverride ?? readDraftForTerminal(selectedTerminal.id);
      const draft = draftSource.trim();
      if (!draft) {
        return;
      }

      const sessionId = selectedTerminal.session?.sessionId;
      if (!accessToken || !sessionId) {
        return;
      }

      resetDraftForTerminal(selectedTerminal.id);
      const nextLabel =
        selectedTerminal.userRenamed === true
          ? selectedTerminal.label
          : formatTerminalCommandTitle(draft) || selectedTerminal.label;
      patchTerminal(selectedTerminal, {
        label: nextLabel,
        lastMessagePreview: draft,
        status: "running",
      });

      try {
        await attachTransport(selectedTerminal, sessionId)?.send(`${draft}\n`);
      } catch (error) {
        patchTerminal(selectedTerminal, {
          status: "error",
        });
        appendSystemMessage(selectedTerminal.id, getErrorMessage(error) || "Failed to send terminal input.", "error");
      }
    },
    [accessToken, appendSystemMessage, attachTransport, patchTerminal, readDraftForTerminal, resetDraftForTerminal],
  );

  const handleTerminalInput = useCallback(
    async (data: string, selectedTerminal: TerminalItem | null) => {
      const sessionId = selectedTerminal?.session?.sessionId;
      if (!selectedTerminal || !data || !accessToken || !sessionId) {
        return;
      }

      patchTerminal(selectedTerminal, {
        status: "running",
      });

      try {
        await attachTransport(selectedTerminal, sessionId)?.send(data);
      } catch (error) {
        patchTerminal(selectedTerminal, {
          status: "error",
        });
        appendSystemMessage(selectedTerminal.id, getErrorMessage(error) || "Failed to send terminal input.", "error");
      }
    },
    [accessToken, appendSystemMessage, attachTransport, patchTerminal],
  );

  const handleTerminalResize = useCallback(
    async (size: { cols: number; rows: number }, selectedTerminal: TerminalItem | null) => {
      if (!selectedTerminal) {
        return;
      }

      setMeasuredSize(selectedTerminal.id, size);

      const sessionId = selectedTerminal.session?.sessionId;
      if (!sessionId) {
        if (selectedTerminal.status === "initializing") {
          await attachOrCreateTerminalSession(selectedTerminal, size);
        }
        return;
      }

      if (!accessToken) {
        return;
      }

      await attachTransport(selectedTerminal, sessionId)?.resize(size);
    },
    [accessToken, attachOrCreateTerminalSession, attachTransport, setMeasuredSize],
  );

  return {
    handleSend,
    handleTerminalInput,
    handleTerminalResize,
  };
}
