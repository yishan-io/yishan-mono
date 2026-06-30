import { generateId } from "@/helpers/generateId";

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

type BlobLike = {
  text: () => Promise<string>;
};

type ArrayBufferLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
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

function isBlobLike(value: unknown): value is BlobLike {
  return typeof value === "object" && value !== null && typeof (value as BlobLike).text === "function";
}

function hasArrayBuffer(value: unknown): value is ArrayBufferLike {
  return typeof value === "object" && value !== null && typeof (value as ArrayBufferLike).arrayBuffer === "function";
}

export function buildRelayRequestId(): string {
  return generateId("relay");
}

export function buildRelayWebSocketUrl(input: {
  accessToken: string;
  nodeId: string;
  relayUrl: string;
}) {
  const url = new URL("/client/ws", input.relayUrl);
  url.searchParams.set("nodeId", input.nodeId);
  url.searchParams.set("access_token", input.accessToken);
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

export function parseRelayJsonMessage(data: string): RelayJsonRpcMessage {
  return JSON.parse(data) as RelayJsonRpcMessage;
}

export async function readRelayBlobTextMessage(data: unknown): Promise<string | null> {
  if (!isBlobLike(data)) {
    return null;
  }

  try {
    return await data.text();
  } catch {
    return null;
  }
}

export async function readRelayBinaryPayload(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (hasArrayBuffer(data)) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return null;
}

export function isLikelyRelayJsonPayload(buffer: Uint8Array) {
  for (const byte of buffer) {
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }

    return byte === 0x7b || byte === 0x5b;
  }

  return false;
}

export function decodeRelayText(buffer: Uint8Array) {
  return relayTextDecoder.decode(buffer);
}
