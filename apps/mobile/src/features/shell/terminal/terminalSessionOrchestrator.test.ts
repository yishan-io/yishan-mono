import { describe, expect, it, vi } from "vitest";

import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";

describe("TerminalSessionOrchestrator", () => {
  it("reuses one existing session and restores buffered output", async () => {
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
      readTerminalOutput: vi.fn().mockResolvedValue({
        output: "hello world",
        running: true,
      }),
      startTerminalSession: vi.fn(),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const restored = await orchestrator.attachOrCreateAndRestore({
      existingSessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(restored).toEqual({
      created: false,
      output: {
        output: "hello world",
        running: true,
      },
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
    expect(commands.readTerminalOutput).toHaveBeenCalledWith("session-1");
  });

  it("creates a replacement session when the existing one is gone", async () => {
    const commands = {
      listTerminalSessions: vi.fn().mockResolvedValue([]),
      readTerminalOutput: vi.fn().mockResolvedValue({
        output: "",
        running: true,
      }),
      startTerminalSession: vi.fn().mockResolvedValue({ sessionId: "session-2" }),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const restored = await orchestrator.attachOrCreateAndRestore({
      createSessionInput: {
        cols: 120,
        rows: 40,
        paneId: "pane-workspace-1",
        tabId: "terminal-1",
      },
      existingSessionId: "stale-session",
      workspaceId: "workspace-1",
    });

    expect(restored).toEqual({
      created: true,
      output: {
        output: "",
        running: true,
      },
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
    expect(commands.readTerminalOutput).toHaveBeenCalledWith("session-2");
  });

  it("creates a new session when the terminal has no existing session id", async () => {
    const commands = {
      listTerminalSessions: vi.fn(),
      readTerminalOutput: vi.fn().mockResolvedValue({
        output: "",
        running: true,
      }),
      startTerminalSession: vi.fn().mockResolvedValue({ sessionId: "session-3" }),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const restored = await orchestrator.attachOrCreateAndRestore({
      createSessionInput: {
        paneId: "pane-workspace-1",
        tabId: "terminal-1",
      },
      workspaceId: "workspace-1",
    });

    expect(restored.created).toBe(true);
    expect(commands.listTerminalSessions).not.toHaveBeenCalled();
    expect(commands.startTerminalSession).toHaveBeenCalledWith({
      paneId: "pane-workspace-1",
      tabId: "terminal-1",
    });
  });

  it("preserves exited session reuse and normalizes status from restore output", async () => {
    const commands = {
      listTerminalSessions: vi.fn().mockResolvedValue([
        {
          pid: 42,
          sessionId: "session-4",
          status: "running",
          workspaceId: "workspace-1",
        },
      ]),
      readTerminalOutput: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: "done",
        running: false,
      }),
      startTerminalSession: vi.fn(),
    };
    const orchestrator = new TerminalSessionOrchestrator(commands);

    const restored = await orchestrator.attachOrCreateAndRestore({
      existingSessionId: "session-4",
      workspaceId: "workspace-1",
    });

    expect(restored).toEqual({
      created: false,
      output: {
        exitCode: 0,
        output: "done",
        running: false,
      },
      session: {
        pid: 42,
        sessionId: "session-4",
        status: "exited",
        workspaceId: "workspace-1",
      },
    });
    expect(commands.startTerminalSession).not.toHaveBeenCalled();
  });
});
