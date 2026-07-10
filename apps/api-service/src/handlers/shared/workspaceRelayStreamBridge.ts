import { RelayStreamClient, type RelayStreamEventHandlers } from "@/lib/relay-stream-client";
import type { AppServices } from "@/services";

const OPEN_WEBSOCKET_STATE = 1;

type RelayBridgeWebSocket = {
  close: (code?: number, reason?: string) => void;
  readyState: number;
  send: (data: string) => void;
};

type WorkspaceRelayAccessInput = {
  actorUserId: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
};

/** Represents the common control messages supported by mobile relay bridge sockets. */
export type RelayBridgeControlMessage =
  | {
      type: "ping";
    }
  | {
      type: "unsubscribe";
    };

/** Stores mutable relay-bridge connection state for one client websocket. */
export type RelayBridgeState = {
  closed: boolean;
  relayClient: RelayStreamClient | null;
};

/** Describes one connected workspace relay stream plus the resolved access metadata. */
export type WorkspaceRelayStreamConnection = {
  relayAccess: Awaited<ReturnType<AppServices["workspace"]["resolveRelayAccess"]>>;
  relayClient: RelayStreamClient;
};

function isWebSocketOpen(ws: RelayBridgeWebSocket): boolean {
  return ws.readyState === OPEN_WEBSOCKET_STATE;
}

function closeRelayClient(state: RelayBridgeState): void {
  state.relayClient?.close();
  state.relayClient = null;
}

/** Creates one empty mutable relay-bridge state record. */
export function createRelayBridgeState(): RelayBridgeState {
  return {
    closed: false,
    relayClient: null,
  };
}

/** Closes the relay-side connection while keeping client-websocket state unchanged. */
export function closeRelayBridgeConnection(state: RelayBridgeState): void {
  closeRelayClient(state);
}

/** Marks one client websocket as closed and tears down its relay-side connection. */
export function handleRelayBridgeSocketClose(state: RelayBridgeState): void {
  state.closed = true;
  closeRelayClient(state);
}

/** Sends one JSON payload to the client websocket when it is still open. */
export function sendRelayBridgeJson(ws: RelayBridgeWebSocket, payload: unknown): boolean {
  if (!isWebSocketOpen(ws)) {
    return false;
  }

  ws.send(JSON.stringify(payload));
  return true;
}

/** Sends one standard bridge error payload to the client websocket when possible. */
export function sendRelayBridgeError(ws: RelayBridgeWebSocket, message: string): void {
  sendRelayBridgeJson(ws, {
    message,
    type: "error",
  });
}

/** Handles one websocket-level error from the mobile client connection. */
export function handleRelayBridgeSocketError(state: RelayBridgeState, ws: RelayBridgeWebSocket, message: string): void {
  if (!state.closed) {
    sendRelayBridgeError(ws, message);
  }

  closeRelayClient(state);
}

/** Parses one incoming websocket JSON record and enforces a string `type` field. */
export function readRelayBridgeMessageRecord(
  payload: string,
  streamLabel: string,
): Record<string, unknown> & { type: string } {
  const decoded = JSON.parse(payload) as Record<string, unknown>;
  const type = typeof decoded.type === "string" ? decoded.type : null;
  if (!type) {
    throw new Error(`${streamLabel} websocket message type is required`);
  }

  return {
    ...decoded,
    type,
  };
}

/** Handles one shared control message and returns whether it was fully consumed. */
export function handleRelayBridgeControlMessage(ws: RelayBridgeWebSocket, message: RelayBridgeControlMessage): boolean {
  if (message.type === "ping") {
    sendRelayBridgeJson(ws, { type: "pong" });
    return true;
  }

  ws.close(1000, "Client unsubscribed");
  return true;
}

/** Creates one relay stream handler set with common close/error behavior wired in. */
export function createRelayStreamEventHandlers(input: {
  handlers: Omit<RelayStreamEventHandlers, "onClose" | "onError">;
  relayDisconnectedMessage: string;
  state: RelayBridgeState;
  ws: RelayBridgeWebSocket;
}): RelayStreamEventHandlers {
  return {
    ...input.handlers,
    onClose: () => {
      if (!input.state.closed) {
        sendRelayBridgeError(input.ws, input.relayDisconnectedMessage);
        input.ws.close(1011, "Relay disconnected");
      }
    },
    onError: (error) => {
      if (!input.state.closed) {
        sendRelayBridgeError(input.ws, error.message);
      }
    },
  };
}

/** Resolves access and opens one persistent relay stream client for a workspace websocket bridge. */
export async function connectWorkspaceRelayStream(input: {
  handlers: RelayStreamEventHandlers;
  relayAccessInput: WorkspaceRelayAccessInput;
  services: AppServices;
  state: RelayBridgeState;
}): Promise<WorkspaceRelayStreamConnection> {
  closeRelayClient(input.state);

  const relayAccess = await input.services.workspace.resolveRelayAccess({
    actorUserId: input.relayAccessInput.actorUserId,
    organizationId: input.relayAccessInput.orgId,
    projectId: input.relayAccessInput.projectId,
    workspaceId: input.relayAccessInput.workspaceId,
  });

  const relayClient = new RelayStreamClient(
    {
      apiToken: relayAccess.relayApiToken,
      nodeId: relayAccess.workspace.nodeId,
      relayUrl: relayAccess.relayUrl,
    },
    input.handlers,
  );
  input.state.relayClient = relayClient;
  await relayClient.connect();

  return {
    relayAccess,
    relayClient,
  };
}
