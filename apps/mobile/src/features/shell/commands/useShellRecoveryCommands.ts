import type { Router } from "expo-router";

import type { ShellTerminalMessages } from "../hooks/useShellTerminalMessages";
import type { TerminalMap } from "../state/shell.types";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import { useShellDrawerAutoDismiss } from "./useShellDrawerAutoDismiss";
import { useShellHomeSelectionRecovery } from "./useShellHomeSelectionRecovery";
import { useShellSelectionRecovery } from "./useShellSelectionRecovery";
import { useShellTerminalRecovery } from "./useShellTerminalRecovery";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type UseShellRecoveryCommandsInput = {
  dismissDrawer: () => void;
  pathname: string;
  router: Router;
  screenContext: ShellScreenContext;
  shell: ShellState;
  t: Translate;
  terminalsById: TerminalMap;
};

export function useShellRecoveryCommands({
  dismissDrawer,
  pathname,
  screenContext,
  shell,
  t,
  terminalsById,
}: UseShellRecoveryCommandsInput) {
  useShellSelectionRecovery({ screenContext, shell });
  useShellHomeSelectionRecovery({ screenContext, shell });
  useShellTerminalRecovery({ screenContext, shell, t, terminalsById });
  useShellDrawerAutoDismiss({
    dismissDrawer,
    isNavOpen: shell.isNavOpen,
    isScreenFocused: shell.isScreenFocused,
    pathname,
  });
}
