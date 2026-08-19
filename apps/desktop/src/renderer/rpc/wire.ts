/**
 * JSON-RPC wire protocol (desktop8 Phase 31: wire types + parsing).
 *
 * Pure protocol codec: request construction and message parsing only. The
 * daemon speaks JSON-RPC 2.0 over the WebSocket; notifications are
 * server-initiated messages with a `method` but no `id`.
 */

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

/** One daemon notification delivered to a subscription listener. */
export type DaemonNotification = {
  method: string;
  payload?: unknown;
};

let nextRequestId = 0;

/** Builds one JSON-RPC request envelope with a unique correlation id. */
export function buildRequest(method: string, params?: unknown): JsonRpcRequest {
  nextRequestId += 1;
  return {
    jsonrpc: "2.0",
    id: `req-${nextRequestId}`,
    method,
    params,
  };
}

/** Parses one raw socket message into a response or a notification. */
export function parseJsonRpcMessage(data: unknown): JsonRpcResponse | JsonRpcNotification {
  const record =
    typeof data === "string" ? (JSON.parse(data) as Record<string, unknown>) : (data as Record<string, unknown>);
  if (!record || typeof record !== "object") {
    throw new Error("invalid JSON-RPC message");
  }
  if (record.jsonrpc !== "2.0") {
    throw new Error("daemon websocket payload is not JSON-RPC 2.0");
  }
  if (typeof record.method === "string") {
    return {
      jsonrpc: "2.0",
      method: record.method,
      params: record.params,
    };
  }
  return {
    jsonrpc: "2.0",
    id: String(record.id ?? ""),
    result: record.result,
    error: record.error as JsonRpcResponse["error"],
  };
}
