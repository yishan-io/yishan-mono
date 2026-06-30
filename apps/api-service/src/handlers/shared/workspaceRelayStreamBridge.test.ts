import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeRelayBridgeConnection,
  connectWorkspaceRelayStream,
  createRelayBridgeState,
  createRelayStreamEventHandlers,
  handleRelayBridgeControlMessage,
  handleRelayBridgeSocketClose,
  handleRelayBridgeSocketError,
  readRelayBridgeMessageRecord,
} from "@/handlers/shared/workspaceRelayStreamBridge";
import type { RelayBridgeState } from "@/handlers/shared/workspaceRelayStreamBridge";

const relayClientMockState = vi.hoisted(() => {
  const instances: RelayStreamClientMock[] = [];

  class RelayStreamClientMock {
    public close = vi.fn();
    public connect = vi.fn(async () => undefined);

    public constructor(
      public readonly config: Record<string, unknown>,
      public readonly handlers: Record<string, unknown>,
    ) {
      instances.push(this);
    }
  }

  return {
    instances,
    RelayStreamClientMock,
  };
});

type RelayStreamClientMock = InstanceType<typeof relayClientMockState.RelayStreamClientMock>;

vi.mock("@/lib/relay-stream-client", () => ({
  RelayStreamClient: relayClientMockState.RelayStreamClientMock,
}));

function createWebSocketStub() {
  return {
    close: vi.fn(),
    readyState: 1,
    send: vi.fn(),
  };
}

function createStateWithRelayClient(relayClient: { close: ReturnType<typeof vi.fn> }): RelayBridgeState {
  return {
    closed: false,
    relayClient: relayClient as unknown as RelayBridgeState["relayClient"],
  };
}

describe("readRelayBridgeMessageRecord", () => {
  it("returns a typed record when the payload includes a string type", () => {
    expect(readRelayBridgeMessageRecord(JSON.stringify({ type: "ping", value: 1 }), "Terminal")).toEqual({
      type: "ping",
      value: 1,
    });
  });

  it("throws when the payload does not include a string type", () => {
    expect(() => readRelayBridgeMessageRecord(JSON.stringify({ value: 1 }), "Terminal")).toThrow(
      "Terminal websocket message type is required",
    );
  });
});

describe("relay bridge control helpers", () => {
  it("responds to ping messages with pong", () => {
    const ws = createWebSocketStub();

    const handled = handleRelayBridgeControlMessage(ws, { type: "ping" });

    expect(handled).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "pong" }));
  });

  it("closes the socket on unsubscribe", () => {
    const ws = createWebSocketStub();

    const handled = handleRelayBridgeControlMessage(ws, { type: "unsubscribe" });

    expect(handled).toBe(true);
    expect(ws.close).toHaveBeenCalledWith(1000, "Client unsubscribed");
  });

  it("closes the relay client when the bridge socket closes", () => {
    const relayClient = { close: vi.fn() };
    const state = createStateWithRelayClient(relayClient);

    handleRelayBridgeSocketClose(state);

    expect(state.closed).toBe(true);
    expect(relayClient.close).toHaveBeenCalledTimes(1);
    expect(state.relayClient).toBeNull();
  });

  it("sends a socket error to the client and closes the relay client", () => {
    const relayClient = { close: vi.fn() };
    const state = createStateWithRelayClient(relayClient);
    const ws = createWebSocketStub();

    handleRelayBridgeSocketError(state, ws, "Terminal websocket failed.");

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ message: "Terminal websocket failed.", type: "error" }));
    expect(relayClient.close).toHaveBeenCalledTimes(1);
    expect(state.relayClient).toBeNull();
  });

  it("closes the relay connection without marking the websocket closed", () => {
    const relayClient = { close: vi.fn() };
    const state = createStateWithRelayClient(relayClient);

    closeRelayBridgeConnection(state);

    expect(state.closed).toBe(false);
    expect(relayClient.close).toHaveBeenCalledTimes(1);
    expect(state.relayClient).toBeNull();
  });
});

describe("createRelayStreamEventHandlers", () => {
  it("forwards relay disconnects to the websocket and closes it", () => {
    const state = createRelayBridgeState();
    const ws = createWebSocketStub();

    const handlers = createRelayStreamEventHandlers({
      handlers: {},
      relayDisconnectedMessage: "Relay disconnected.",
      state,
      ws,
    });

    handlers.onClose?.({} as CloseEvent);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ message: "Relay disconnected.", type: "error" }));
    expect(ws.close).toHaveBeenCalledWith(1011, "Relay disconnected");
  });

  it("forwards relay errors to the websocket", () => {
    const state = createRelayBridgeState();
    const ws = createWebSocketStub();

    const handlers = createRelayStreamEventHandlers({
      handlers: {},
      relayDisconnectedMessage: "Relay disconnected.",
      state,
      ws,
    });

    handlers.onError?.(new Error("boom"));

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ message: "boom", type: "error" }));
  });
});

describe("connectWorkspaceRelayStream", () => {
  beforeEach(() => {
    relayClientMockState.instances.length = 0;
  });

  it("resolves relay access, closes any previous client, and connects a new stream client", async () => {
    const previousRelayClient = { close: vi.fn() };
    const state = createStateWithRelayClient(previousRelayClient);
    const relayAccess = {
      relayApiToken: "token-1",
      relayUrl: "ws://relay.test",
      workspace: {
        id: "workspace-1",
        localPath: "/tmp/workspace-1",
        nodeId: "node-1",
      },
    };
    const resolveRelayAccess = vi.fn(async () => relayAccess);

    const result = await connectWorkspaceRelayStream({
      handlers: {},
      relayAccessInput: {
        actorUserId: "user-1",
        orgId: "org-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
      },
      services: {
        workspace: {
          resolveRelayAccess,
        },
      } as never,
      state,
    });

    expect(previousRelayClient.close).toHaveBeenCalledTimes(1);
    expect(resolveRelayAccess).toHaveBeenCalledWith({
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(relayClientMockState.instances).toHaveLength(1);
    expect(relayClientMockState.instances[0]?.connect).toHaveBeenCalledTimes(1);
    expect(state.relayClient).toBe(relayClientMockState.instances[0]);
    expect(result).toEqual({
      relayAccess,
      relayClient: relayClientMockState.instances[0],
    });
  });
});
