import { useCallback } from "react";

import type { AuthStatus } from "@/features/auth";
import {
  listWorkspaceTerminalSessions,
  startWorkspaceTerminal,
  stopWorkspaceTerminal,
} from "@/features/workspaces/workspaces.api";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { logMobileDebug, summarizeDebugError } from "@/lib/debug/mobileDebug";
import type { TerminalItem, TerminalMessage } from "../state/shell.types";
import {
  bindTerminalSessionStartLease,
  buildStartWorkspaceTerminalInput,
  buildTerminalLaunchInput,
  releaseTerminalSessionStartLease,
  resetTerminalSessionStartLease,
  tryClaimTerminalSessionStartLease,
} from "./terminal-runtime-session-helpers";
import type { TerminalTransport } from "./terminal-transport";
import {
  type RuntimeSnapshot,
  type TerminalMeasuredSize,
  isCurrentRuntimeSnapshot,
} from "./terminal-transport-controller-domain";
import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";

type TerminalPatchFn = (
  terminal: Pick<TerminalItem, "id" | "workspaceId">,
  patch: Partial<Omit<TerminalItem, "id" | "workspaceId">>,
  options?: { touchUpdatedAt?: boolean },
) => void;

/**
 * Owns one mobile attach/create flow:
 * resolve a session, then let daemon-backed websocket snapshot restore output.
 */
export function useTerminalAttachOrCreateSessionCommand({
  accessToken,
  appendSystemMessage,
  attachTransport,
  getRuntimeSnapshot,
  patchTerminal,
  peekRuntimeSnapshot,
  status,
}: {
  accessToken: string | null;
  appendSystemMessage: (terminalId: string, text: string, status?: TerminalMessage["status"]) => void;
  attachTransport: (terminal: TerminalItem, sessionId: string) => TerminalTransport | null;
  getRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot;
  patchTerminal: TerminalPatchFn;
  peekRuntimeSnapshot: (terminalId: string) => RuntimeSnapshot | null;
  status: AuthStatus;
}) {
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
      let createdSessionId: string | null = null;

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
          startTerminalSession: (input) =>
            startWorkspaceTerminal(accessToken, terminal.orgId, terminal.projectId, terminal.workspaceId, input),
        });

        const resolvedSession = await orchestrator.attachOrCreateSession({
          createSessionInput: buildStartWorkspaceTerminalInput(terminal.workspaceId, terminal.id, initialSize),
          existingSessionId,
          workspaceId: terminal.workspaceId,
        });
        logMobileDebug("terminal.restore", "attach or create result", {
          created: resolvedSession.created,
          sessionId: resolvedSession.session.sessionId,
          terminalId: terminal.id,
          workspaceId: terminal.workspaceId,
        });
        if (resolvedSession.created) {
          createdSessionId = resolvedSession.session.sessionId;
        }

        if (!isCurrentRuntimeSnapshot(peekRuntimeSnapshot(terminal.id), snapshot)) {
          if (createdSessionId) {
            await stopOrphanedSession(createdSessionId);
            createdSessionId = null;
          }
          return;
        }

        snapshot.ensuredSessionId = resolvedSession.session.sessionId;
        snapshot.exited = resolvedSession.session.status !== "running";
        bindTerminalSessionStartLease(terminal.id, resolvedSession.session.sessionId);
        didBindLease = true;

        patchTerminal(
          terminal,
          {
            session: resolvedSession.session,
            status: resolvedSession.session.status === "running" ? "running" : "idle",
          },
          { touchUpdatedAt: false },
        );

        if (!isCurrentRuntimeSnapshot(peekRuntimeSnapshot(terminal.id), snapshot)) {
          if (createdSessionId) {
            await stopOrphanedSession(createdSessionId);
            createdSessionId = null;
          }
          return;
        }

        const transport = attachTransport(terminal, resolvedSession.session.sessionId);
        if (!transport) {
          throw new Error("Terminal transport is unavailable.");
        }

        transport.connect();

        if (resolvedSession.created) {
          const launchInput = buildTerminalLaunchInput(terminal);
          if (launchInput) {
            await transport.send(launchInput);
          }
        }
      } catch (error) {
        logMobileDebug("terminal.restore", "attach or create error", {
          error: summarizeDebugError(error),
          existingSessionId,
          terminalId: terminal.id,
          workspaceId: terminal.workspaceId,
        });
        if (createdSessionId) {
          await stopOrphanedSession(createdSessionId);
        }
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
    [accessToken, appendSystemMessage, attachTransport, getRuntimeSnapshot, patchTerminal, peekRuntimeSnapshot, status],
  );
}
