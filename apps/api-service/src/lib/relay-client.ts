type RelayRpcErrorShape = {
  code: number;
  data?: unknown;
  message: string;
};

type RelayJsonRpcResponse = {
  error?: RelayRpcErrorShape;
  id?: string | number | null;
  jsonrpc?: string;
  result?: unknown;
};

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

function buildRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseMessage(data: unknown): RelayJsonRpcResponse {
  if (typeof data === "string") {
    return JSON.parse(data) as RelayJsonRpcResponse;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data)) as RelayJsonRpcResponse;
  }

  if (ArrayBuffer.isView(data)) {
    return JSON.parse(new TextDecoder().decode(data)) as RelayJsonRpcResponse;
  }

  throw new Error("Unsupported relay websocket payload");
}

export async function invokeRelayJsonRpc<T>({
  apiToken,
  method,
  nodeId,
  params,
  relayUrl,
  timeoutMs = 10_000,
}: {
  apiToken: string;
  method: string;
  nodeId: string;
  params?: unknown;
  relayUrl: string;
  timeoutMs?: number;
}): Promise<T> {
  const requestId = buildRequestId();
  const url = new URL("/client/ws", relayUrl);
  url.searchParams.set("nodeId", nodeId);
  url.searchParams.set("token", apiToken);

  return new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(url.toString());
    let settled = false;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
      socket.close();
    };

    const timeoutId = setTimeout(() => {
      finalize(() => reject(new Error(`Relay request timed out for ${method}`)));
    }, timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: requestId,
          jsonrpc: "2.0",
          method,
          params: params ?? {},
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      let payload: RelayJsonRpcResponse;

      try {
        payload = parseMessage(event.data);
      } catch (error) {
        finalize(() => reject(error));
        return;
      }

      if (payload.jsonrpc !== "2.0" || payload.id !== requestId) {
        return;
      }

      if (payload.error) {
        const { code, data, message } = payload.error;
        finalize(() => reject(new RelayRpcError(code, message, data)));
        return;
      }

      finalize(() => resolve(payload.result as T));
    });

    socket.addEventListener("error", () => {
      finalize(() => reject(new Error(`Relay websocket failed for ${method}`)));
    });

    socket.addEventListener("close", (event) => {
      if (settled) {
        return;
      }

      finalize(() => reject(new Error(event.reason || `Relay websocket closed before ${method} completed`)));
    });
  });
}
