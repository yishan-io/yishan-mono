// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  closeTerminalSession,
  createTerminalSession,
  listDetectedPorts,
  listTerminalSessions,
  readTerminalOutput,
  resizeTerminal,
  subscribeTerminalOutput,
  subscribeTerminalSessions,
  writeTerminalInput,
} from "./terminalCommands";

const mocks = vi.hoisted(() => ({
  closeSession: vi.fn(),
  createSession: vi.fn(),
  listDetectedPorts: vi.fn(),
  listSessions: vi.fn(),
  readOutput: vi.fn(),
  resize: vi.fn(),
  subscribeSessions: vi.fn(),
  subscribeOutput: vi.fn(),
  writeInput: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    terminal: {
      closeSession: mocks.closeSession,
      createSession: mocks.createSession,
      listDetectedPorts: mocks.listDetectedPorts,
      listSessions: mocks.listSessions,
      readOutput: mocks.readOutput,
      subscribeSessions: {
        subscribe: mocks.subscribeSessions,
      },
      subscribeOutput: {
        subscribe: mocks.subscribeOutput,
      },
      resize: mocks.resize,
      writeInput: mocks.writeInput,
    },
  })),
}));

describe("terminalCommands", () => {
  it("forwards terminal requests to terminal service", async () => {
    await createTerminalSession({ cwd: "/tmp/repo", cols: 120, rows: 40 });
    await writeTerminalInput({ sessionId: "session-1", data: "ls\n" });
    await resizeTerminal({ sessionId: "session-1", cols: 140, rows: 42 });
    await readTerminalOutput({ sessionId: "session-1", fromIndex: 10 });
    await listDetectedPorts();
    await listTerminalSessions({ includeExited: true });
    await subscribeTerminalOutput({
      sessionId: "session-1",
      onData: vi.fn(),
      onError: vi.fn(),
    });
    await subscribeTerminalSessions({
      onData: vi.fn(),
      onError: vi.fn(),
    });
    await closeTerminalSession({ sessionId: "session-1" });

    expect(mocks.createSession).toHaveBeenCalledWith({ cwd: "/tmp/repo", cols: 120, rows: 40 });
    expect(mocks.writeInput).toHaveBeenCalledWith({ sessionId: "session-1", data: "ls\n" });
    expect(mocks.resize).toHaveBeenCalledWith({ sessionId: "session-1", cols: 140, rows: 42 });
    expect(mocks.readOutput).toHaveBeenCalledWith({ sessionId: "session-1", fromIndex: 10 });
    expect(mocks.listDetectedPorts).toHaveBeenCalledTimes(1);
    expect(mocks.listSessions).toHaveBeenCalledWith({ includeExited: true });
    expect(mocks.subscribeOutput).toHaveBeenCalledWith(
      { sessionId: "session-1" },
      expect.objectContaining({
        onData: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mocks.subscribeSessions).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onData: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mocks.closeSession).toHaveBeenCalledWith({ sessionId: "session-1" });
  });
});
