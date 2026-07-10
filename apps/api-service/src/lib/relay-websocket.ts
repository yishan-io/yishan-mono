export type RelayJsonRpcMessage = {
  error?: {
    code: number;
    data?: unknown;
    message: string;
  };
  id?: string | number | null;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
};

const relayTextDecoder = new TextDecoder();

export class RelayRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RelayRpcError";
  }
}

export function buildRelayRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildRelayWebSocketUrl(input: {
  apiToken: string;
  nodeId: string;
  relayUrl: string;
}) {
  const url = new URL("/client/ws", input.relayUrl);
  url.searchParams.set("nodeId", input.nodeId);
  url.searchParams.set("token", input.apiToken);
  return url;
}

export function buildRelayJsonRpcRequestMessage(input: {
  id: string;
  method: string;
  params?: unknown;
}) {
  return JSON.stringify({
    id: input.id,
    jsonrpc: "2.0",
    method: input.method,
    params: input.params ?? {},
  });
}

export function parseRelayJsonMessage(data: unknown): RelayJsonRpcMessage {
  if (typeof data === "string") {
    return JSON.parse(data) as RelayJsonRpcMessage;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(relayTextDecoder.decode(data)) as RelayJsonRpcMessage;
  }

  if (ArrayBuffer.isView(data)) {
    return JSON.parse(relayTextDecoder.decode(data)) as RelayJsonRpcMessage;
  }

  throw new Error("Unsupported relay websocket payload");
}

export function decodeRelayBinaryPayload(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  throw new Error("Unsupported relay websocket binary payload");
}

export function decodeRelayText(buffer: Uint8Array) {
  return relayTextDecoder.decode(buffer);
}
