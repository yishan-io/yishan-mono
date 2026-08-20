import type { DaemonNotification } from "@renderer/rpc";
// @vitest-environment jsdom
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonTerminalClient } from "./daemonTerminalClient";

/**
 * Regression coverage for the desktop8 refactor bug where terminal output
 * frames lost the `type: "output"` discriminator. `terminalSessionService`
 * treats any payload without `type === "output"` as an exit event and closes
 * the tab, so a missing discriminator made every terminal tab auto-close the
 * moment the shell prompt arrived.
 */
describe("DaemonTerminalClient output event shape", () => {
  let client: DaemonTerminalClient;
  let subscribeTransportMock: Mock<
    (method: string, params: unknown, listener: (event: DaemonNotification) => void) => () => void
  >;
  let notifySubscription: ((event: DaemonNotification) => void) | undefined;
  let binaryListener: ((frame: ArrayBuffer) => void) | undefined;

  beforeEach(() => {
    notifySubscription = undefined;
    binaryListener = undefined;
    subscribeTransportMock = vi.fn(
      (_method: string, _params: unknown, listener: (event: DaemonNotification) => void) => {
        notifySubscription = listener;
        return () => {
          notifySubscription = undefined;
        };
      },
    );
    client = new DaemonTerminalClient({
      invoke: vi.fn().mockResolvedValue({}),
      resolveWorkspaceId: vi.fn().mockResolvedValue("workspace-1"),
      subscribeTransport: subscribeTransportMock,
      sendBinary: vi.fn(),
      subscribeBinary: vi.fn((listener: (frame: ArrayBuffer) => void) => {
        binaryListener = listener;
        return () => {
          binaryListener = undefined;
        };
      }),
      subscribeConnectionStatus: vi.fn(() => () => {}),
    });
  });

  it("includes type:output when routing binary terminal output frames", async () => {
    const onData = vi.fn();
    await client.subscribeOutput({ sessionId: "session-1" }, { onData });

    // Binary frame: [0x02] 'session-1' \0 'ls output'
    const frame = new Uint8Array([
      0x02,
      ...new TextEncoder().encode("session-1"),
      0,
      ...new TextEncoder().encode("hello"),
    ]);
    binaryListener?.(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));

    const call = onData.mock.calls[0]?.[0] as {
      type?: string;
      sessionId?: string;
      chunk?: Uint8Array;
      nextIndex?: number;
    };
    expect(call?.type).toBe("output");
    expect(call?.sessionId).toBe("session-1");
    expect(call?.nextIndex).toBe(1);
    expect(call?.chunk).toBeInstanceOf(Uint8Array);
    expect(Array.from(call?.chunk ?? [])).toEqual(Array.from(new TextEncoder().encode("hello")));
  });

  it("includes type:output when routing JSON terminal.output notifications", async () => {
    const onData = vi.fn();
    await client.subscribeOutput({ sessionId: "session-1" }, { onData });

    notifySubscription?.({
      method: "terminal.output",
      payload: { sessionId: "session-1", chunk: "hello" },
    });

    expect(onData).toHaveBeenCalledWith({
      type: "output",
      sessionId: "session-1",
      chunk: "hello",
      nextIndex: 1,
    });
  });

  it("normalizes terminal.exit notifications with type:exit", async () => {
    const onData = vi.fn();
    await client.subscribeOutput({ sessionId: "session-1" }, { onData });

    // The terminal.exit transport subscription must be registered so the
    // exact-method-match transport can route exit notifications to the
    // session handler (desktop8 regression: exit notifications were dropped).
    const registeredMethods = subscribeTransportMock.mock.calls.map((call) => call[0]);
    expect(registeredMethods).toContain("terminal.exit");

    // Route the exit through the terminal.exit subscription listener, as the
    // transport would.
    const exitListenerIndex = subscribeTransportMock.mock.calls.findIndex((call) => call[0] === "terminal.exit");
    const exitListener = subscribeTransportMock.mock.calls[exitListenerIndex]?.[2] as
      | ((event: DaemonNotification) => void)
      | undefined;
    exitListener?.({
      method: "terminal.exit",
      payload: { sessionId: "session-1", exitCode: 0 },
    });

    expect(onData).toHaveBeenCalledWith({
      type: "exit",
      sessionId: "session-1",
      exitCode: 0,
    });
  });
});
