import { useCallback } from "react";

import { sendWorkspaceTerminalInput } from "@/features/workspaces/workspaces.api";
import type { TerminalItem } from "../state/shell.types";
import { buildTerminalLaunchInput } from "./terminal-runtime-session-helpers";

export function useTerminalLaunchAgentCommand({ accessToken }: { accessToken: string | null }) {
  const launchTerminalAgent = useCallback(
    async (terminal: TerminalItem, sessionId: string) => {
      const launchInput = buildTerminalLaunchInput(terminal);
      if (!launchInput || !accessToken) {
        return;
      }

      await sendWorkspaceTerminalInput(
        accessToken,
        terminal.orgId,
        terminal.projectId,
        terminal.workspaceId,
        sessionId,
        launchInput,
      );
    },
    [accessToken],
  );

  return {
    launchTerminalAgent,
  };
}
