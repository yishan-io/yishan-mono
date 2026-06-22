import type { WorkspaceTerminalOutput, WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
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
  output: WorkspaceTerminalOutput;
  session: TerminalBackendSession;
};

/**
 * Mirrors desktop terminal attach/create/restore semantics while staying
 * transport-agnostic for the mobile runtime boundary.
 */
export class TerminalSessionOrchestrator {
  constructor(
    private readonly commands: {
      listTerminalSessions: (params?: { includeExited?: boolean }) => Promise<WorkspaceTerminalSession[]>;
      readTerminalOutput: (sessionId: string) => Promise<WorkspaceTerminalOutput>;
      startTerminalSession: (input?: MobileTerminalSessionCreateInput) => Promise<{ sessionId: string }>;
    },
  ) {}

  /**
   * Resolves one existing session when available, otherwise creates one
   * replacement session, and restores buffered output before live transport
   * attaches.
   */
  async attachOrCreateAndRestore(input: {
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
      logMobileDebug("terminal.restore", "read output", {
        created: false,
        sessionId: existingSession.sessionId,
        workspaceId: input.workspaceId,
      });
      const output = await this.commands.readTerminalOutput(existingSession.sessionId);
      logMobileDebug("terminal.restore", "read output result", {
        created: false,
        exitCode: output.exitCode ?? null,
        outputLength: output.output.length,
        running: output.running,
        sessionId: existingSession.sessionId,
        workspaceId: input.workspaceId,
      });
      return {
        created: false,
        output,
        session: normalizeTerminalSessionStatus(existingSession, output),
      };
    }

    const createdSession = await this.commands.startTerminalSession(input.createSessionInput);
    logMobileDebug("terminal.restore", "read output", {
      created: true,
      sessionId: createdSession.sessionId,
      workspaceId: input.workspaceId,
    });
    const output = await this.commands.readTerminalOutput(createdSession.sessionId);
    logMobileDebug("terminal.restore", "read output result", {
      created: true,
      exitCode: output.exitCode ?? null,
      outputLength: output.output.length,
      running: output.running,
      sessionId: createdSession.sessionId,
      workspaceId: input.workspaceId,
    });
    return {
      created: true,
      output,
      session: {
        sessionId: createdSession.sessionId,
        status: output.running ? "running" : "exited",
        workspaceId: input.workspaceId,
      },
    };
  }

  private async resolveExistingSession(sessionId: string): Promise<WorkspaceTerminalSession | undefined> {
    const terminalSessions = await this.commands.listTerminalSessions({ includeExited: true });
    return terminalSessions.find((session) => session.sessionId === sessionId);
  }
}

function normalizeTerminalSessionStatus(
  session: WorkspaceTerminalSession,
  output: WorkspaceTerminalOutput,
): TerminalBackendSession {
  return {
    exitedAt: session.exitedAt,
    paneId: session.paneId,
    pid: session.pid,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    status: output.running ? "running" : "exited",
    tabId: session.tabId,
    workspaceId: session.workspaceId,
  };
}
