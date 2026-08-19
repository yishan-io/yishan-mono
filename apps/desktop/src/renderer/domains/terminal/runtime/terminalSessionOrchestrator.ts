import { getErrorMessage } from "@shared/helpers/errorHelpers";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { getTerminalRuntime } from "./terminalRuntimeRegistry";
import type { TerminalTabData } from "./terminalRuntimeTypes";
type TerminalSnapshot = {
  nextIndex: number;
  chunks: string[];
  exited: boolean;
};
type TerminalCreateSessionParams = {
  cols?: number;
  rows?: number;
  workspaceId: string;
  tabId?: string;
  paneId?: string;
};
const TERMINAL_SESSION_NOT_FOUND_MESSAGE = "Terminal session not found";
type TerminalResolvedSession = {
  sessionId: string;
  snapshot: TerminalSnapshot;
};
const inFlightSessionResolutionByTabId = new Map<string, Promise<TerminalResolvedSession>>();

/**
 * Coordinates renderer-side terminal session attach/create/restore and IO helpers.
 */
export class TerminalSessionOrchestrator {
  constructor(
    private readonly commands: {
      createTerminalSession: (params: TerminalCreateSessionParams) => Promise<{ sessionId: string }>;
      listTerminalSessions?: (params?: { includeExited?: boolean }) => Promise<Array<{ sessionId: string }>>;
      readTerminalOutput: (params: { sessionId: string; fromIndex: number }) => Promise<TerminalSnapshot>;
      writeTerminalInput: (params: { sessionId: string; data: string }) => Promise<{ ok: true }>;
      resizeTerminal: (params: { sessionId: string; cols: number; rows: number }) => Promise<{ ok: true }>;
      closeTerminalSession?: (params: { sessionId: string }) => Promise<unknown>;
    },
    private readonly tabData: TerminalTabData,
    private readonly onSessionBound: (tabId: string, sessionId: string) => void = () => {},
  ) {}

  /**
   * Attaches one existing session first, falls back to creating one, and restores buffered output into xterm.
   */
  async attachOrCreateAndRestore(input: {
    tabId: string;
    terminal: Pick<Terminal, "write" | "cols" | "rows">;
    fitAddon: Pick<FitAddon, "fit">;
  }): Promise<{ sessionId: string; nextIndex: number; exited: boolean } | null> {
    const tab = this.tabData;
    if (!tab.workspaceId) {
      return null;
    }

    const resolvedSession = await this.resolveSessionSnapshot(input.tabId);

    try {
      input.fitAddon.fit();
    } catch {
      // Ignore fit races during mount/unmount; session attach can still proceed.
    }
    if (resolvedSession.snapshot.chunks.length > 0) {
      try {
        const fullOutput = resolvedSession.snapshot.chunks.join("");
        // Write buffered output in chunks to avoid blocking the main thread
        // for sessions with large output history.
        const RESTORE_CHUNK_SIZE = 64 * 1024; // 64 KB per chunk
        if (fullOutput.length <= RESTORE_CHUNK_SIZE) {
          input.terminal.write(fullOutput);
        } else {
          for (let offset = 0; offset < fullOutput.length; offset += RESTORE_CHUNK_SIZE) {
            input.terminal.write(fullOutput.slice(offset, offset + RESTORE_CHUNK_SIZE));
          }
        }
      } catch {
        // Ignore write races during teardown; live subscription still restores output.
      }
    }

    await this.commands.resizeTerminal({
      sessionId: resolvedSession.sessionId,
      cols: input.terminal.cols,
      rows: input.terminal.rows,
    });

    return {
      sessionId: resolvedSession.sessionId,
      nextIndex: resolvedSession.snapshot.nextIndex,
      exited: resolvedSession.snapshot.exited,
    };
  }

  /**
   * Resolves one stable terminal session snapshot per tab and deduplicates concurrent creation requests.
   */
  private async resolveSessionSnapshot(tabId: string): Promise<TerminalResolvedSession> {
    const existing = inFlightSessionResolutionByTabId.get(tabId);
    if (existing) {
      return await existing;
    }

    const resolution = this.resolveSessionSnapshotUncached(tabId);
    inFlightSessionResolutionByTabId.set(tabId, resolution);
    try {
      return await resolution;
    } finally {
      if (inFlightSessionResolutionByTabId.get(tabId) === resolution) {
        inFlightSessionResolutionByTabId.delete(tabId);
      }
    }
  }

  /**
   * Resolves one terminal session snapshot by reusing one existing session or creating a replacement when missing.
   */
  private async resolveSessionSnapshotUncached(tabId: string): Promise<TerminalResolvedSession> {
    let sessionId = normalizeOptionalText(getTerminalRuntime(tabId)?.sessionId ?? undefined);
    let snapshot: TerminalSnapshot | undefined;
    let isNewSession = false;

    if (sessionId) {
      // api-service can restart while renderer keeps tab state, so persisted session ids
      // may become stale even though the tab still exists.
      const existingSessionId = await this.resolveExistingSessionId(sessionId);
      if (!existingSessionId) {
        sessionId = undefined;
      }
    }

    if (sessionId) {
      try {
        snapshot = await this.commands.readTerminalOutput({ sessionId, fromIndex: 0 });
      } catch (error) {
        const message = getErrorMessage(error);
        if (!message.includes(TERMINAL_SESSION_NOT_FOUND_MESSAGE)) {
          throw error;
        }
        sessionId = undefined;
      }
    }

    if (!sessionId || !snapshot) {
      const created = await this.commands.createTerminalSession({
        workspaceId: this.tabData.workspaceId,
        tabId,
        paneId: resolveTerminalPaneId(tabId, this.tabData.paneId),
      });
      sessionId = created.sessionId;

      const stillExists = getTerminalRuntime(tabId) != null;
      if (!stillExists) {
        await this.commands.closeTerminalSession?.({ sessionId }).catch(() => {});
        throw new Error("Terminal tab was closed before session could be attached");
      }

      snapshot = await this.commands.readTerminalOutput({ sessionId, fromIndex: 0 });
      isNewSession = true;
    }

    if (getTerminalRuntime(tabId)?.sessionId !== sessionId) {
      this.onSessionBound(tabId, sessionId);
    }

    if (isNewSession) {
      const launchCommand = normalizeOptionalText(this.tabData.launchCommand);
      if (launchCommand) {
        await this.commands.writeTerminalInput({
          sessionId,
          data: `${buildTerminalLaunchCommand(launchCommand, Boolean(this.tabData.agentKind))}\r`,
        });
      }
    }

    return {
      sessionId,
      snapshot,
    };
  }

  /**
   * Returns one existing session id when still present in backend session summaries.
   *
   * This proactive existence check avoids noisy "Terminal session not found"
   * readOutput errors after backend restart.
   */
  private async resolveExistingSessionId(sessionId: string): Promise<string | undefined> {
    if (!this.commands.listTerminalSessions) {
      return sessionId;
    }

    try {
      const terminalSessions = await this.commands.listTerminalSessions({ includeExited: true });
      return terminalSessions.some((session) => session.sessionId === sessionId) ? sessionId : undefined;
    } catch {
      return sessionId;
    }
  }
}

/** Resolves one pane id with deterministic fallback to one tab-based id. */
function resolveTerminalPaneId(tabId: string, paneId: string | undefined): string {
  const normalizedPaneId = paneId?.trim();
  if (normalizedPaneId) {
    return normalizedPaneId;
  }

  return `pane-${tabId}`;
}

/** Builds one launch command; agent tabs exec, regular commands keep shell alive. */
function buildTerminalLaunchCommand(launchCommand: string, shouldExec: boolean): string {
  const trimmedCommand = launchCommand.trim();
  if (!shouldExec || trimmedCommand.startsWith("exec ")) {
    return trimmedCommand;
  }

  return `exec ${trimmedCommand}`;
}

/** Normalizes one optional text and maps blank input to undefined. */
function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
