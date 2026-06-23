import { describe, expect, it, vi } from "vitest";

import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";

describe("TerminalSessionOrchestrator", () => {
  it("reuses one existing session without reading transcript output", async () => {
    const commands = {
      listTerminalSessions: vi.fn().mockResolvedValue([
        {
          paneId: "pane-workspace-1",
          pid: 42,
          sessionId: "session-1",
          status: "running",
          tabId: "terminal-1",
          workspaceId: "workspace-1",
        },
      ]),
      startTerminalSession: vi.fn(),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const resolved = await orchestrator.attachOrCreateSession({
      existingSessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(resolved).toEqual({
      created: false,
      session: {
        paneId: "pane-workspace-1",
        pid: 42,
        sessionId: "session-1",
        status: "running",
        tabId: "terminal-1",
        workspaceId: "workspace-1",
      },
    });
    expect(commands.startTerminalSession).not.toHaveBeenCalled();
    expect(commands.listTerminalSessions).toHaveBeenCalledWith({ includeExited: true });
  });

  it("creates a replacement session when the existing one is gone", async () => {
    const commands = {
      listTerminalSessions: vi.fn().mockResolvedValue([]),
      startTerminalSession: vi.fn().mockResolvedValue({ sessionId: "session-2" }),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const resolved = await orchestrator.attachOrCreateSession({
      createSessionInput: {
        cols: 120,
        rows: 40,
        paneId: "pane-workspace-1",
        tabId: "terminal-1",
      },
      existingSessionId: "stale-session",
      workspaceId: "workspace-1",
    });

    expect(resolved).toEqual({
      created: true,
      session: {
        sessionId: "session-2",
        status: "running",
        workspaceId: "workspace-1",
      },
    });
    expect(commands.startTerminalSession).toHaveBeenCalledWith({
      cols: 120,
      rows: 40,
      paneId: "pane-workspace-1",
      tabId: "terminal-1",
    });
  });

  it("creates a new session when the terminal has no existing session id", async () => {
    const commands = {
      listTerminalSessions: vi.fn(),
      startTerminalSession: vi.fn().mockResolvedValue({ sessionId: "session-3" }),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const resolved = await orchestrator.attachOrCreateSession({
      createSessionInput: {
        paneId: "pane-workspace-1",
        tabId: "terminal-1",
      },
      workspaceId: "workspace-1",
    });

    expect(resolved.created).toBe(true);
    expect(commands.listTerminalSessions).not.toHaveBeenCalled();
    expect(commands.startTerminalSession).toHaveBeenCalledWith({
      paneId: "pane-workspace-1",
      tabId: "terminal-1",
    });
  });

  it("preserves exited session status when reusing an existing exited session", async () => {
    const commands = {
      listTerminalSessions: vi.fn().mockResolvedValue([
        {
          exitedAt: "2026-06-23T00:00:00.000Z",
          pid: 42,
          sessionId: "session-4",
          status: "exited",
          workspaceId: "workspace-1",
        },
      ]),
      startTerminalSession: vi.fn(),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const resolved = await orchestrator.attachOrCreateSession({
      existingSessionId: "session-4",
      workspaceId: "workspace-1",
    });

    expect(resolved).toEqual({
      created: false,
      session: {
        exitedAt: "2026-06-23T00:00:00.000Z",
        pid: 42,
        sessionId: "session-4",
        status: "exited",
        workspaceId: "workspace-1",
      },
    });
    expect(commands.startTerminalSession).not.toHaveBeenCalled();
  });
});
