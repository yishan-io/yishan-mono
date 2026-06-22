import * as React from "react";

import { APP_MODAL_SHEET_CLOSE_ANIMATION_MS } from "@/components/ui/AppModalSheet";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { usePaneTabSelectorState } from "@/features/shell/hooks/usePaneTabSelectorState";
import type { ShellPaneTab, TerminalMap } from "../state/shell.types";
import { getShellPaneTabLabel, getShellPaneTabTypeLabel } from "../view-model/shell-labels";

export type PaneTabListRow = {
  key: string;
  label: string;
  rightOpenValue: number;
  tab: ShellPaneTab;
  typeLabel: string;
};

type UsePaneTabSelectorModelInput = {
  activePaneTabId: string | null;
  onClose: () => void;
  onClosePaneTab: (tabId: string) => void;
  onRenameTerminal: (terminalId: string, nextLabel: string) => void;
  onSelectPaneTab: (tabId: string) => void;
  open: boolean;
  tabs: ShellPaneTab[];
  terminalsById: TerminalMap;
};

export const SWIPE_ACTION_WIDTH = 96;
export const TERMINAL_SWIPE_OPEN_VALUE = -(SWIPE_ACTION_WIDTH * 2);
export const DEFAULT_SWIPE_OPEN_VALUE = -SWIPE_ACTION_WIDTH;

export function usePaneTabSelectorModel({
  activePaneTabId,
  onClose,
  onClosePaneTab,
  onRenameTerminal,
  onSelectPaneTab,
  open,
  tabs,
  terminalsById,
}: UsePaneTabSelectorModelInput) {
  // Owns list-row projection plus close/select timing; dialog state stays in usePaneTabSelectorState.
  const { t } = useAppLanguage();
  const listRef = React.useRef<{ closeAllOpenRows?: () => void } | null>(null);
  const deferredSelectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    actionTerminal,
    closeActionDialog,
    closeRenameDialog,
    openRenameDialog,
    renameTerminal,
    renameTitle,
    renameValue,
    resetTransientState,
    setActionTerminalId,
    setRenameValue,
  } = usePaneTabSelectorState({
    open,
    terminalsById,
  });

  const paneTabRows = React.useMemo<PaneTabListRow[]>(
    () =>
      tabs.map((tab) => ({
        key: tab.id,
        label: getShellPaneTabLabel(tab, terminalsById, t),
        rightOpenValue: tab.kind === "terminal" ? TERMINAL_SWIPE_OPEN_VALUE : DEFAULT_SWIPE_OPEN_VALUE,
        tab,
        typeLabel: getShellPaneTabTypeLabel(tab, t),
      })),
    [t, tabs, terminalsById],
  );

  const closeOpenRows = React.useCallback(() => {
    listRef.current?.closeAllOpenRows?.();
  }, []);

  const clearDeferredSelectTimeout = React.useCallback(() => {
    if (!deferredSelectTimeoutRef.current) {
      return;
    }

    clearTimeout(deferredSelectTimeoutRef.current);
    deferredSelectTimeoutRef.current = null;
  }, []);

  const closeSheet = React.useCallback(() => {
    closeOpenRows();
    resetTransientState();
    onClose();
  }, [closeOpenRows, onClose, resetTransientState]);

  const selectPaneTab = React.useCallback(
    (tabId: string) => {
      clearDeferredSelectTimeout();
      closeSheet();
      deferredSelectTimeoutRef.current = setTimeout(() => {
        deferredSelectTimeoutRef.current = null;
        onSelectPaneTab(tabId);
      }, APP_MODAL_SHEET_CLOSE_ANIMATION_MS);
    },
    [clearDeferredSelectTimeout, closeSheet, onSelectPaneTab],
  );

  const closePaneTab = React.useCallback(
    (tabId: string) => {
      closeOpenRows();
      onClosePaneTab(tabId);
      if (tabId === activePaneTabId) {
        closeSheet();
      }
    },
    [activePaneTabId, closeOpenRows, closeSheet, onClosePaneTab],
  );

  const submitRename = React.useCallback(() => {
    if (!renameTerminal) {
      return;
    }

    const nextLabel = renameValue.trim();
    if (!nextLabel) {
      return;
    }

    onRenameTerminal(renameTerminal.id, nextLabel);
    closeRenameDialog();
  }, [closeRenameDialog, onRenameTerminal, renameTerminal, renameValue]);

  React.useEffect(() => clearDeferredSelectTimeout, [clearDeferredSelectTimeout]);

  return {
    actionTerminal,
    closeActionDialog,
    closeRenameDialog,
    closeSheet,
    closePaneTab,
    listRef,
    openRenameDialog,
    paneTabRows,
    renameTerminal,
    renameTitle,
    renameValue,
    selectPaneTab,
    setActionTerminalId,
    setRenameValue,
    submitRename,
    t,
  };
}
