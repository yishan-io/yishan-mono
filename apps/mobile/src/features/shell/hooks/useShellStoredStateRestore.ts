import { useEffect } from "react";

import { mergeStoredTerminalRuntime } from "@/features/shell/state/shell-stored-state-helpers";
import type { TerminalItem } from "@/features/shell/state/shell.types";
import {
  getShellSessionRestorePromise,
  getShellSessionStateSnapshot,
  setShellSessionHasRestoredStoredState,
  setShellSessionPaneLayoutByWorkspaceId,
  setShellSessionRestorePromise,
  setShellSessionSelectedNodeIdByOrganization,
  setShellSessionTerminalsByWorkspaceId,
  setShellSessionWorkspaceTabStateByWorkspaceId,
} from "@/features/shell/state/shellSessionStore";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { logMobileDebug } from "@/lib/debug/mobileDebug";
import { loadStoredShellState, loadStoredTerminalRuntimeState } from "@/lib/storage/shell-state-storage";
import { shouldStartShellStoredStateRestore } from "./shell-stored-state-restore-domain";

function summarizeTerminalMap(terminalsByWorkspaceId: Record<string, TerminalItem[]>) {
  return Object.fromEntries(
    Object.entries(terminalsByWorkspaceId).map(([workspaceId, terminals]) => [
      workspaceId,
      terminals.map((terminal) => ({
        id: terminal.id,
        importedFromBackend: terminal.importedFromBackend === true,
        label: terminal.label,
        sessionId: terminal.session?.sessionId ?? null,
        status: terminal.status ?? null,
      })),
    ]),
  );
}

export function useShellStoredStateRestore() {
  useEffect(() => {
    if (
      !shouldStartShellStoredStateRestore({
        hasActiveRestorePromise: getShellSessionRestorePromise() !== null,
        hasRestoredStoredState: getShellSessionStateSnapshot().hasRestoredStoredState,
      })
    ) {
      return;
    }

    const restorePromise = (async () => {
      try {
        const [stored, storedTerminalRuntime] = await Promise.all([
          loadStoredShellState(),
          loadStoredTerminalRuntimeState(),
        ]);
        const restoredTerminalsByWorkspaceId = mergeStoredTerminalRuntime(
          stored?.terminalsByWorkspaceId ?? {},
          storedTerminalRuntime,
        );

        if (Object.keys(restoredTerminalsByWorkspaceId).length > 0) {
          setShellSessionTerminalsByWorkspaceId(restoredTerminalsByWorkspaceId);
        }

        if (stored?.selectedNodeIdByOrganization) {
          setShellSessionSelectedNodeIdByOrganization(stored.selectedNodeIdByOrganization);
        }

        if (stored?.paneLayoutByWorkspaceId) {
          setShellSessionPaneLayoutByWorkspaceId(stored.paneLayoutByWorkspaceId);
        }

        if (stored?.workspaceTabStateByWorkspaceId) {
          setShellSessionWorkspaceTabStateByWorkspaceId(stored.workspaceTabStateByWorkspaceId);
        }

        logMobileDebug("shell.restore", "restored shell state", {
          restoredPaneLayoutWorkspaceIds: Object.keys(stored?.paneLayoutByWorkspaceId ?? {}),
          restoreSource: "storage",
          restoredTerminalsByWorkspaceId: summarizeTerminalMap(restoredTerminalsByWorkspaceId),
          restoredWorkspaceTabStateWorkspaceIds: Object.keys(stored?.workspaceTabStateByWorkspaceId ?? {}),
          storedWorkspaceIds: Object.keys(restoredTerminalsByWorkspaceId),
        });
      } catch (error) {
        logMobileDebug("shell.restore", "restore failed", {
          error: getErrorMessage(error),
        });
      } finally {
        setShellSessionHasRestoredStoredState(true);
        setShellSessionRestorePromise(null);
      }
    })();

    setShellSessionRestorePromise(restorePromise);
  }, []);
}
