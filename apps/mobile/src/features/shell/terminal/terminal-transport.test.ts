import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWebSocketTerminalTransport } from "./terminal-transport";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly sentMessages: string[] = [];
  readyState = MockWebSocket.CONNECTING;
  onclose: ((event: { reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data });
  }
}

describe("terminal-transport", () => {
  const OriginalWebSocket = globalThis.WebSocket;
  let socketInstances: MockWebSocket[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    socketInstances = [];

    class WebSocketStub extends MockWebSocket {
      static readonly CONNECTING = MockWebSocket.CONNECTING;
      static readonly OPEN = MockWebSocket.OPEN;
      static readonly CLOSING = MockWebSocket.CLOSING;
      static readonly CLOSED = MockWebSocket.CLOSED;

      constructor(url: string) {
        super(url);
        socketInstances.push(this);
      }
    }

    globalThis.WebSocket = WebSocketStub as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
  });

  it("waits for ready before sending terminal input", async () => {
    const onOutput = vi.fn();
    const transport = createWebSocketTerminalTransport({
      handlers: {
        onError: vi.fn(),
        onOutput,
      },
      url: "ws://example.test/terminal",
    });

    const sendPromise = transport.send("exec codex\r");
    const socket = socketInstances[0];

    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error("Expected websocket connection to be created.");
    }

    expect(socket.sentMessages).toEqual([]);

    socket.emitOpen();
    await Promise.resolve();
    expect(socket.sentMessages).toEqual([]);

    socket.emitMessage(JSON.stringify({ sessionId: "session-1", type: "ready" }));
    await sendPromise;

    expect(socket.sentMessages).toEqual([JSON.stringify({ input: "exec codex\r", type: "input" })]);
    expect(onOutput).not.toHaveBeenCalled();
  });

  it("replays the latest resize once the socket becomes ready", async () => {
    const transport = createWebSocketTerminalTransport({
      handlers: {
        onError: vi.fn(),
        onOutput: vi.fn(),
      },
      url: "ws://example.test/terminal",
    });

    const resizePromise = transport.resize({ cols: 120, rows: 40 });
    const socket = socketInstances[0];

    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error("Expected websocket connection to be created.");
    }

    socket.emitOpen();
    await Promise.resolve();
    expect(socket.sentMessages).toEqual([]);

    socket.emitMessage(JSON.stringify({ sessionId: "session-1", type: "ready" }));
    await resizePromise;

    expect(socket.sentMessages).toEqual([JSON.stringify({ cols: 120, rows: 40, type: "resize" })]);
  });
});
