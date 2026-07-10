import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

import type { TerminalMap } from "../state/shell.types";

type UsePaneTabSelectorStateOptions = {
  open: boolean;
  terminalsById: TerminalMap;
};

export function usePaneTabSelectorState({ open, terminalsById }: UsePaneTabSelectorStateOptions) {
  // Owns transient selector-only dialog state so the sheet component stays presentation-focused.
  const { t } = useAppLanguage();
  const [actionTerminalId, setActionTerminalId] = useState<string | null>(null);
  const [renameTerminalId, setRenameTerminalId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const actionTerminal = actionTerminalId ? (terminalsById[actionTerminalId] ?? null) : null;
  const renameTerminal = renameTerminalId ? (terminalsById[renameTerminalId] ?? null) : null;
  const renameTitle = useMemo(() => renameTerminal?.label ?? t("shell.newTerminal"), [renameTerminal?.label, t]);

  const resetTransientState = useCallback(() => {
    setActionTerminalId(null);
    setRenameTerminalId(null);
    setRenameValue("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetTransientState();
    }
  }, [open, resetTransientState]);

  const openRenameDialog = useCallback(
    (terminalId: string) => {
      const terminal = terminalsById[terminalId];
      if (!terminal) {
        return;
      }

      setRenameTerminalId(terminal.id);
      setRenameValue(terminal.label);
      setActionTerminalId(null);
    },
    [terminalsById],
  );

  return {
    actionTerminal,
    closeActionDialog: () => setActionTerminalId(null),
    closeRenameDialog: () => {
      setRenameTerminalId(null);
      setRenameValue("");
    },
    openRenameDialog,
    renameTerminal,
    renameTitle,
    renameValue,
    resetTransientState,
    setActionTerminalId,
    setRenameValue,
  };
}
