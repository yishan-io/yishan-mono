import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateId } from "@/helpers/generateId";
import { clearRelayFrontendEventHub, subscribeRelayFrontendEvents } from "./relay-frontend-event-hub";
import { clearRelayNodeTokenCache } from "./relay-node-token";

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

describe("relay-frontend-event-hub", () => {
  const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  let socketInstances: MockWebSocket[] = [];

  beforeEach(() => {
    socketInstances = [];
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.test";

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ expiresAt: "2099-01-01T00:00:00.000Z", token: "relay-token" }), {
            status: 200,
          }),
      ),
    );

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
    clearRelayFrontendEventHub();
    clearRelayNodeTokenCache();

    if (originalApiBaseUrl === undefined) {
      process.env.EXPO_PUBLIC_API_BASE_URL = undefined;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }

    vi.unstubAllGlobals();
  });

  it("shares one websocket per node and fans out frontend events to all subscribers", async () => {
    const firstMessages = vi.fn();
    const secondMessages = vi.fn();

    const unsubscribeFirst = subscribeRelayFrontendEvents({
      accessToken: "access-token",
      node: {
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: generateId("workspace"),
      },
      onMessage: firstMessages,
      relayUrl: "http://relay.test",
    });
    const unsubscribeSecond = subscribeRelayFrontendEvents({
      accessToken: "access-token",
      node: {
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: generateId("workspace"),
      },
      onMessage: secondMessages,
      relayUrl: "http://relay.test",
    });

    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });
    const socket = socketInstances[0];
    socket?.emitOpen();

    await vi.waitFor(() => {
      expect(socket?.sentMessages).toHaveLength(1);
    });

    const request = JSON.parse(socket?.sentMessages[0] ?? "{}") as Record<string, unknown>;
    expect(request.method).toBe("events.frontendStream");
    expect(socketInstances).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    socket?.emitMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "events.frontendStream",
        params: {
          payload: { workspaceId: "workspace-1" },
          topic: "workspaceSnapshotChanged",
        },
      }),
    );

    await vi.waitFor(() => {
      expect(firstMessages).toHaveBeenCalledWith({
        message: {
          payload: { workspaceId: "workspace-1" },
          topic: "workspaceSnapshotChanged",
          type: "event",
        },
        node: expect.objectContaining({ nodeId: "node-1" }),
      });
      expect(secondMessages).toHaveBeenCalledWith({
        message: {
          payload: { workspaceId: "workspace-1" },
          topic: "workspaceSnapshotChanged",
          type: "event",
        },
        node: expect.objectContaining({ nodeId: "node-1" }),
      });
    });

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("closes an in-flight frontend stream connection when the last subscriber unsubscribes before open", async () => {
    const onMessage = vi.fn();

    const unsubscribe = subscribeRelayFrontendEvents({
      accessToken: "access-token",
      node: {
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: generateId("workspace"),
      },
      onMessage,
      relayUrl: "http://relay.test",
    });

    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });

    const socket = socketInstances[0];
    unsubscribe();
    socket?.emitOpen();

    await vi.waitFor(() => {
      expect(socket?.readyState).toBe(MockWebSocket.CLOSED);
    });
    expect(socket?.sentMessages).toEqual([]);
    expect(onMessage).not.toHaveBeenCalled();
  });
});
