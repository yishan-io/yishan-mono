import { useCallback } from "react";

import type { AuthStatus } from "@/features/auth";
import {
  listWorkspaceTerminalSessions,
  readWorkspaceTerminalOutput,
  startWorkspaceTerminal,
  stopWorkspaceTerminal,
} from "@/features/workspaces/workspaces.api";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { logMobileDebug, summarizeDebugError } from "@/lib/debug/mobileDebug";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import {
  bindTerminalSessionStartLease,
  buildStartWorkspaceTerminalInput,
  releaseTerminalSessionStartLease,
  resetTerminalSessionStartLease,
  tryClaimTerminalSessionStartLease,
} from "./terminal-runtime-session-helpers";
import {
  type RuntimeSnapshot,
  type TerminalMeasuredSize,
  isCurrentRuntimeSnapshot,
} from "./terminal-transport-controller-domain";
import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";
import { useTerminalLaunchAgentCommand } from "./useTerminalLaunchAgentCommand";

type TerminalPatchFn = (
  terminal: Pick<TerminalItem, "id" | "workspaceId">,
  patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
  options?: { touchUpdatedAt?: boolean },
) => void;

/**
 * Owns one desktop-equivalent mobile attach/create/restore flow:
 * resolve session, restore buffered output, then attach live transport.
 */
export function useTerminalAttachOrCreateSessionCommand({
  accessToken,
  appendSystemMessage,
  attachTransport,
  getRuntimeSnapshot,
  patchTerminal,
  peekRuntimeSnapshot,
  restoreTerminalOutput,
  status,
}: {
  accessToken: string | null;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  attachTransport: (terminal: TerminalItem, sessionId: string) => { connect: () => void } | null;
  getRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot;
  patchTerminal: TerminalPatchFn;
  peekRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot | null;
  restoreTerminalOutput: (
    terminal: TerminalItem,
    sessionId: string,
    output: { output: string; running: boolean; exitCode?: number | null },
  ) => void;
  status: AuthStatus;
}) {
  const { launchTerminalAgent } = useTerminalLaunchAgentCommand({ accessToken });

  return useCallback(
    async (terminal: TerminalItem, initialSize?: TerminalMeasuredSize | null) => {
      const snapshot = getRuntimeSnapshot(terminal.id);
      if (snapshot.ensuring) {
        return;
      }

      const existingSessionId = terminal.session?.sessionId ?? null;
      const requiresCreateLease = !existingSessionId;
      if (requiresCreateLease && !tryClaimTerminalSessionStartLease(terminal.id)) {
        return;
      }

      const releaseUnboundLease = () => {
        if (requiresCreateLease) {
          releaseTerminalSessionStartLease(terminal.id);
        }
      };

      snapshot.ensuring = true;
      let didBindLease = false;

      if (!accessToken || status !== "authenticated") {
        releaseUnboundLease();
        patchTerminal(terminal, { status: "error" });
        appendSystemMessage(terminal.id, "Missing access token for terminal session.", "error");
        snapshot.ensuring = false;
        return;
      }

      const stopOrphanedSession = async (sessionId: string) => {
        try {
          await stopWorkspaceTerminal(accessToken, terminal.orgId, terminal.projectId, terminal.workspaceId, sessionId);
        } catch {
          // Ignore cleanup failure once the local lifecycle has already moved on.
        }
      };

      try {
        logMobileDebug("terminal.restore", "attach or create start", {
          existingSessionId,
          hasInitialSize: Boolean(initialSize),
          terminalId: terminal.id,
          workspaceId: terminal.workspaceId,
        });

        const orchestrator = new TerminalSessionOrchestrator({
          listTerminalSessions: (options) =>
            listWorkspaceTerminalSessions(
              accessToken,
              terminal.orgId,
              terminal.projectId,
              terminal.workspaceId,
              options,
            ),
          readTerminalOutput: (sessionId) =>
            readWorkspaceTerminalOutput(
              accessToken,
              terminal.orgId,
              terminal.projectId,
              terminal.workspaceId,
              sessionId,
            ),
          startTerminalSession: (input) =>
            startWorkspaceTerminal(accessToken, terminal.orgId, terminal.projectId, terminal.workspaceId, input),
        });

        const restoreResult = await orchestrator.attachOrCreateAndRestore({
          createSessionInput: buildStartWorkspaceTerminalInput(terminal.workspaceId, terminal.id, initialSize),
          existingSessionId,
          workspaceId: terminal.workspaceId,
        });
        logMobileDebug("terminal.restore", "attach or create result", {
          created: restoreResult.created,
          exitCode: restoreResult.output.exitCode ?? null,
          outputLength: restoreResult.output.output.length,
          running: restoreResult.output.running,
          sessionId: restoreResult.session.sessionId,
          terminalId: terminal.id,
          workspaceId: terminal.workspaceId,
        });

        if (!isCurrentRuntimeSnapshot(peekRuntimeSnapshot(terminal.id), snapshot)) {
          if (restoreResult.created) {
            await stopOrphanedSession(restoreResult.session.sessionId);
          }
          return;
        }

        snapshot.ensuredSessionId = restoreResult.session.sessionId;
        snapshot.exited = !restoreResult.output.running;
        bindTerminalSessionStartLease(terminal.id, restoreResult.session.sessionId);
        didBindLease = true;

        restoreTerminalOutput(terminal, restoreResult.session.sessionId, restoreResult.output);
        patchTerminal(
          terminal,
          {
            session: restoreResult.session,
            status: restoreResult.output.running ? "running" : "idle",
          },
          { touchUpdatedAt: false },
        );

        if (!isCurrentRuntimeSnapshot(peekRuntimeSnapshot(terminal.id), snapshot)) {
          if (restoreResult.created) {
            await stopOrphanedSession(restoreResult.session.sessionId);
          }
          return;
        }

        if (restoreResult.created) {
          await launchTerminalAgent(terminal, restoreResult.session.sessionId);
        }

        if (restoreResult.output.running) {
          attachTransport(terminal, restoreResult.session.sessionId)?.connect();
        }
      } catch (error) {
        logMobileDebug("terminal.restore", "attach or create error", {
          error: summarizeDebugError(error),
          existingSessionId,
          terminalId: terminal.id,
          workspaceId: terminal.workspaceId,
        });
        if (!existingSessionId) {
          resetTerminalSessionStartLease(terminal.id);
        }
        patchTerminal(terminal, { status: "error" });
        appendSystemMessage(terminal.id, getErrorMessage(error) || "Failed to restore terminal.", "error");
      } finally {
        if (!didBindLease) {
          releaseUnboundLease();
        }
        snapshot.ensuring = false;
      }
    },
    [
      accessToken,
      appendSystemMessage,
      attachTransport,
      getRuntimeSnapshot,
      launchTerminalAgent,
      patchTerminal,
      peekRuntimeSnapshot,
      restoreTerminalOutput,
      status,
    ],
  );
}
