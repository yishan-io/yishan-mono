import { useCallback } from "react";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import type { ShellState } from "../state/useShellState";
import { type ShellCreateTerminalActionInput, buildShellCreateTerminalPayload } from "./shell-create-terminal-domain";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellCreateTerminalAction({
  closeDrawer,
  shell,
  t,
}: {
  closeDrawer: () => void;
  shell: ShellState;
  t: Translate;
}) {
  return useCallback(
    (workspace: Workspace, input: ShellCreateTerminalActionInput) => {
      shell.createTerminal(buildShellCreateTerminalPayload(workspace, input, t));
      closeDrawer();
    },
    [closeDrawer, shell, t],
  );
}
