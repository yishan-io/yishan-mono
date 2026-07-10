import {
  type RelayJsonRpcMessage,
  RelayRpcError,
  buildRelayJsonRpcRequestMessage,
  buildRelayRequestId,
  buildRelayWebSocketUrl,
  parseRelayJsonMessage,
} from "@/lib/relay-websocket";

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
  const requestId = buildRelayRequestId();
  const url = buildRelayWebSocketUrl({
    apiToken,
    nodeId,
    relayUrl,
  });

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
      socket.send(buildRelayJsonRpcRequestMessage({ id: requestId, method, params }));
    });

    socket.addEventListener("message", (event) => {
      let payload: RelayJsonRpcMessage;

      try {
        payload = parseRelayJsonMessage(event.data);
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
