import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearRelayNodeTokenCache } from "@/lib/relay/relay-node-token";
import { clearRelayRequestClientPool } from "@/lib/relay/relay-request-client-pool";
import {
  listRelayTerminalSessions,
  startRelayTerminalSession,
  stopRelayTerminalSession,
} from "./relay-terminal-sessions";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly listeners = {
    close: [] as Array<(event: CloseEvent) => void>,
    error: [] as Array<() => void>,
    message: [] as Array<(event: MessageEvent) => void>,
    open: [] as Array<() => void>,
  };
  readonly sentMessages: string[] = [];
  readyState = MockWebSocket.CONNECTING;

  constructor(readonly url: string) {}

  addEventListener(type: "open" | "message" | "error" | "close", listener: (...args: unknown[]) => void) {
    this.listeners[type].push(listener as never);
  }

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emitClose("");
  }

  emitClose(reason: string) {
    this.readyState = MockWebSocket.CLOSED;
    for (const listener of this.listeners.close) {
      listener({ reason } as CloseEvent);
    }
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.message) {
      listener({ data } as MessageEvent);
    }
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    for (const listener of this.listeners.open) {
      listener();
    }
  }
}

describe("relay-terminal-sessions", () => {
  const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const originalRelayUrl = process.env.EXPO_PUBLIC_RELAY_URL;
  let socketInstances: MockWebSocket[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    socketInstances = [];
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.test";
    process.env.EXPO_PUBLIC_RELAY_URL = "http://relay.test";
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ expiresAt: "2099-01-01T00:00:00.000Z", token: "relay-token" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

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

    vi.stubGlobal("WebSocket", WebSocketStub);
  });

  afterEach(() => {
    clearRelayRequestClientPool();
    clearRelayNodeTokenCache();

    if (originalApiBaseUrl === undefined) {
      process.env.EXPO_PUBLIC_API_BASE_URL = undefined;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }

    if (originalRelayUrl === undefined) {
      process.env.EXPO_PUBLIC_RELAY_URL = undefined;
    } else {
      process.env.EXPO_PUBLIC_RELAY_URL = originalRelayUrl;
    }
    vi.unstubAllGlobals();
  });

  it("lists terminal sessions over relay and normalizes the daemon summary", async () => {
    const listPromise = listRelayTerminalSessions({
      accessToken: "access-token",
      includeExited: true,
      nodeId: "node-1",
      workspaceId: "workspace-1",
    });

    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });
    const socket = socketInstances[0];
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/nodes/node-1/relay-token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(socket?.url).toBe("http://relay.test/client/ws?nodeId=node-1&access_token=relay-token");
    socket?.emitOpen();
    await vi.waitFor(() => {
      expect(socket?.sentMessages).toHaveLength(1);
    });

    const request = JSON.parse(socket?.sentMessages[0] ?? "{}");
    expect(request.method).toBe("terminal.listSessions");
    expect(request.params).toEqual({
      includeExited: true,
      workspaceId: "workspace-1",
    });

    socket?.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: [
          {
            paneId: "pane-1",
            pid: 42,
            sessionId: "session-1",
            startedAt: "2026-06-18T00:00:00.000Z",
            status: "running",
            tabId: "terminal-1",
            workspaceId: "workspace-1",
          },
          {
            pid: 12,
            sessionId: "session-2",
            status: "stopped",
            workspaceId: "workspace-1",
          },
        ],
      }),
    );

    await expect(listPromise).resolves.toEqual([
      {
        paneId: "pane-1",
        pid: 42,
        sessionId: "session-1",
        startedAt: "2026-06-18T00:00:00.000Z",
        status: "running",
        tabId: "terminal-1",
        workspaceId: "workspace-1",
      },
      {
        pid: 12,
        sessionId: "session-2",
        status: "exited",
        workspaceId: "workspace-1",
      },
    ]);
  });

  it("starts a terminal session over relay", async () => {
    const startPromise = startRelayTerminalSession({
      accessToken: "access-token",
      nodeId: "node-1",
      request: {
        cols: 120,
        paneId: "pane-1",
        rows: 40,
        tabId: "terminal-1",
        workspaceId: "workspace-1",
      },
    });

    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });
    const socket = socketInstances[0];
    socket?.emitOpen();
    await vi.waitFor(() => {
      expect(socket?.sentMessages).toHaveLength(1);
    });

    const request = JSON.parse(socket?.sentMessages[0] ?? "{}");
    expect(request.method).toBe("terminal.start");
    expect(request.params).toEqual({
      cols: 120,
      paneId: "pane-1",
      rows: 40,
      tabId: "terminal-1",
      workspaceId: "workspace-1",
    });

    socket?.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: { sessionId: "session-9" },
      }),
    );

    await expect(startPromise).resolves.toEqual({ sessionId: "session-9" });
  });

  it("stops a terminal session over relay", async () => {
    const stopPromise = stopRelayTerminalSession({
      accessToken: "access-token",
      nodeId: "node-1",
      sessionId: "session-5",
    });

    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });
    const socket = socketInstances[0];
    socket?.emitOpen();
    await vi.waitFor(() => {
      expect(socket?.sentMessages).toHaveLength(1);
    });

    const request = JSON.parse(socket?.sentMessages[0] ?? "{}");
    expect(request.method).toBe("terminal.stop");
    expect(request.params).toEqual({ sessionId: "session-5" });

    socket?.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: { stopped: true },
      }),
    );

    await expect(stopPromise).resolves.toBeUndefined();
  });

  it("fails fast when the terminal node id is missing", async () => {
    await expect(
      listRelayTerminalSessions({
        accessToken: "access-token",
        nodeId: "",
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("Missing nodeId for relay terminal session.");

    expect(socketInstances).toHaveLength(0);
  });
});
