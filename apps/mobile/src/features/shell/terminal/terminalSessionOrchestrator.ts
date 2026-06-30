import type { WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
import { logMobileDebug } from "@/lib/debug/mobileDebug";
import type { TerminalBackendSession } from "../state/shell.types";

export type MobileTerminalSessionCreateInput = {
  cols?: number;
  rows?: number;
  tabId?: string;
  paneId?: string;
};

type MobileTerminalResolvedSession = {
  created: boolean;
  session: TerminalBackendSession;
};

/**
 * Resolves one backend terminal session for the mobile runtime boundary
 * without taking ownership of transcript restore.
 */
export class TerminalSessionOrchestrator {
  constructor(
    private readonly commands: {
      listTerminalSessions: (params?: { includeExited?: boolean }) => Promise<WorkspaceTerminalSession[]>;
      startTerminalSession: (input?: MobileTerminalSessionCreateInput) => Promise<{ sessionId: string }>;
    },
  ) {}

  /**
   * Resolves one existing session when available, otherwise creates one
   * replacement session. Transcript restore is handled by daemon-backed
   * websocket snapshot delivery after attach.
   */
  async attachOrCreateSession(input: {
    createSessionInput?: MobileTerminalSessionCreateInput;
    existingSessionId?: string | null;
    workspaceId: string;
  }): Promise<MobileTerminalResolvedSession> {
    logMobileDebug("terminal.restore", "resolve", {
      existingSessionId: input.existingSessionId ?? null,
      workspaceId: input.workspaceId,
    });

    const existingSession = input.existingSessionId
      ? await this.resolveExistingSession(input.existingSessionId)
      : undefined;

    if (existingSession) {
      logMobileDebug("terminal.restore", "reuse existing session", {
        created: false,
        sessionId: existingSession.sessionId,
        workspaceId: input.workspaceId,
      });
      return {
        created: false,
        session: normalizeTerminalSessionStatus(existingSession),
      };
    }

    const createdSession = await this.commands.startTerminalSession(input.createSessionInput);
    logMobileDebug("terminal.restore", "created replacement session", {
      created: true,
      sessionId: createdSession.sessionId,
      workspaceId: input.workspaceId,
    });
    return {
      created: true,
      session: {
        sessionId: createdSession.sessionId,
        status: "running",
        workspaceId: input.workspaceId,
      },
    };
  }

  private async resolveExistingSession(sessionId: string): Promise<WorkspaceTerminalSession | undefined> {
    const terminalSessions = await this.commands.listTerminalSessions({ includeExited: true });
    return terminalSessions.find((session) => session.sessionId === sessionId);
  }
}

function normalizeTerminalSessionStatus(session: WorkspaceTerminalSession): TerminalBackendSession {
  return {
    exitedAt: session.exitedAt,
    paneId: session.paneId,
    pid: session.pid,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    status: session.status,
    tabId: session.tabId,
    workspaceId: session.workspaceId,
  };
}
