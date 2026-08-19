// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { terminalFocusStore } from "../../../domains/terminal/state/terminalFocusStore";
import {
  closeTerminalSession,
  createTerminalSession,
  killTerminalProcess,
  listDetectedPorts,
  listTerminalSessions,
  readTerminalOutput,
  requestTerminalFocus,
  resizeTerminal,
  subscribeTerminalOutput,
  subscribeTerminalSessions,
  writeTerminalInput,
} from "./terminalCommands";

const mocks = vi.hoisted(() => ({
  closeSession: vi.fn(),
  killProcess: vi.fn(),
  createSession: vi.fn(),
  listDetectedPorts: vi.fn(),
  listSessions: vi.fn(),
  readOutput: vi.fn(),
  resize: vi.fn(),
  subscribeSessions: vi.fn(),
  subscribeOutput: vi.fn(),
  writeInput: vi.fn(),
}));

vi.mock("../../../domains/terminal/infrastructure/daemonTerminalClient", () => ({
  getTerminalRpc: () =>
    Promise.resolve({
      closeSession: mocks.closeSession,
      killProcess: mocks.killProcess,
      createSession: mocks.createSession,
      listDetectedPorts: mocks.listDetectedPorts,
      listSessions: mocks.listSessions,
      readOutput: mocks.readOutput,
      subscribeSessions: mocks.subscribeSessions,
      subscribeOutput: mocks.subscribeOutput,
      resize: mocks.resize,
      writeInput: mocks.writeInput,
    }),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

describe("terminalCommands", () => {
  it("forwards terminal requests to terminal service", async () => {
    await createTerminalSession({ workspaceId: "workspace-1", cols: 120, rows: 40 });
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
    await killTerminalProcess({ pid: 1234 });

    expect(mocks.createSession).toHaveBeenCalledWith({ workspaceId: "workspace-1", cols: 120, rows: 40 });
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
    expect(mocks.killProcess).toHaveBeenCalledWith({ pid: 1234 });
  });

  describe("terminal focus surface (Phase 17)", () => {
    it("requestTerminalFocus records pending focus on the focus store", () => {
      const requestFocus = vi.fn();
      terminalFocusStore.setState({ requestFocus });

      requestTerminalFocus("tab-terminal-1");

      expect(requestFocus).toHaveBeenCalledWith("tab-terminal-1");
    });
  });
});
