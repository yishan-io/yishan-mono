import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDevMode } from "../runtime/environment";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

type DaemonState = {
  host: string;
  port: number;
};

type DaemonNotification = {
  method: string;
  payload: unknown;
};

type StartSubscriptionOptions = {
  method: string;
  params?: unknown;
  onNotification: (event: DaemonNotification) => void;
};

const RPC_REQUEST_TIMEOUT_MS = 30_000;
const DAEMON_STATE_FILE_NAME = "daemon.state.json";

function resolveCliProfileName(): string {
  if (isDevMode()) {
    return "dev";
  }

  return process.env.YISHAN_PROFILE?.trim() || "default";
}

function resolveDaemonStateFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), DAEMON_STATE_FILE_NAME);
}

function ensureDaemonState(candidate: unknown): DaemonState {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("daemon state is invalid");
  }

  const state = candidate as {
    host?: unknown;
    port?: unknown;
  };

  if (typeof state.host !== "string" || state.host.trim() === "") {
    throw new Error("daemon state host is invalid");
  }

  if (typeof state.port !== "number" || state.port <= 0) {
    throw new Error("daemon state port is invalid");
  }

  return {
    host: state.host,
    port: state.port,
  };
}

function toWebSocketPayload(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  throw new Error("unsupported websocket payload");
}

function parseJsonRpcMessage(data: unknown): JsonRpcResponse | JsonRpcNotification {
  const payload = toWebSocketPayload(data);
  const parsed = JSON.parse(payload) as JsonRpcResponse | JsonRpcNotification;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("daemon websocket payload is invalid");
  }

  if ((parsed as { jsonrpc?: unknown }).jsonrpc !== "2.0") {
    throw new Error("daemon websocket payload is not JSON-RPC 2.0");
  }

  return parsed;
}

async function resolveDaemonWebSocketUrl(): Promise<string> {
  const explicitUrl = process.env.YISHAN_DAEMON_WS_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const stateRaw = await readFile(resolveDaemonStateFilePath(), "utf8");
  const state = ensureDaemonState(JSON.parse(stateRaw));
  return `ws://${state.host}:${state.port}/ws`;
}

async function openSocket(): Promise<WebSocket> {
  const url = await resolveDaemonWebSocketUrl();

  return await new Promise<WebSocket>((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(url);
    let settled = false;

    const resolveOnce = (value: WebSocket) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(value);
    };

    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      rejectPromise(error);
    };

    socket.addEventListener("open", () => {
      resolveOnce(socket);
    });

    socket.addEventListener("error", () => {
      rejectOnce(new Error("failed to connect to daemon websocket"));
    });

    socket.addEventListener("close", () => {
      rejectOnce(new Error("daemon websocket closed before opening"));
    });
  });
}

function buildRequest(method: string, params?: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: randomUUID(),
    method,
    params,
  };
}

export class DaemonJsonRpcClient {
  private readonly subscriptionSockets = new Map<string, WebSocket>();

  async invoke(method: string, params?: unknown): Promise<unknown> {
    const socket = await openSocket();

    return await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const request = buildRequest(method, params);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        rejectPromise(new Error(`daemon RPC request timed out for method \"${method}\"`));
      }, RPC_REQUEST_TIMEOUT_MS);

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      socket.addEventListener("message", (event) => {
        let message: JsonRpcResponse | JsonRpcNotification;
        try {
          message = parseJsonRpcMessage(event.data);
        } catch (error) {
          settle(() => {
            socket.close();
            rejectPromise(error instanceof Error ? error : new Error("failed to parse daemon websocket payload"));
          });
          return;
        }

        if ((message as JsonRpcResponse).id !== request.id) {
          return;
        }

        const response = message as JsonRpcResponse;
        if (response.error) {
          const rpcError = response.error;
          settle(() => {
            socket.close();
            rejectPromise(new Error(`daemon RPC error ${rpcError.code}: ${rpcError.message}`));
          });
          return;
        }

        settle(() => {
          socket.close();
          resolvePromise(response.result);
        });
      });

      socket.addEventListener("close", () => {
        settle(() => {
          rejectPromise(new Error(`daemon websocket closed while waiting for method \"${method}\"`));
        });
      });

      socket.addEventListener("error", () => {
        settle(() => {
          rejectPromise(new Error(`daemon websocket failed while calling method \"${method}\"`));
        });
      });

      socket.send(JSON.stringify(request));
    });
  }

  async startSubscription(options: StartSubscriptionOptions): Promise<string> {
    const socket = await openSocket();
    const request = buildRequest(options.method, options.params);

    const subscriptionId = randomUUID();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        rejectPromise(new Error(`daemon subscription timed out for method \"${options.method}\"`));
      }, RPC_REQUEST_TIMEOUT_MS);

      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolvePromise();
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        rejectPromise(error);
      };

      socket.addEventListener("message", (event) => {
        let message: JsonRpcResponse | JsonRpcNotification;
        try {
          message = parseJsonRpcMessage(event.data);
        } catch (error) {
          socket.close();
          rejectOnce(error instanceof Error ? error : new Error("failed to parse daemon websocket payload"));
          return;
        }

        if ((message as JsonRpcNotification).method) {
          const notification = message as JsonRpcNotification;
          try {
            options.onNotification({
              method: notification.method,
              payload: notification.params,
            });
          } catch {
            // Ignore listener errors to keep daemon stream alive.
          }
          return;
        }

        const response = message as JsonRpcResponse;
        if (response.id !== request.id) {
          return;
        }

        if (response.error) {
          const rpcError = response.error;
          socket.close();
          rejectOnce(new Error(`daemon RPC error ${rpcError.code}: ${rpcError.message}`));
          return;
        }

        resolveOnce();
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          rejectOnce(new Error(`daemon websocket closed while subscribing to method \"${options.method}\"`));
          return;
        }
        this.subscriptionSockets.delete(subscriptionId);
      });

      socket.addEventListener("error", () => {
        if (!this.subscriptionSockets.has(subscriptionId)) {
          rejectOnce(new Error(`daemon websocket failed while subscribing to method \"${options.method}\"`));
        }
      });

      socket.send(JSON.stringify(request));
    });

    this.subscriptionSockets.set(subscriptionId, socket);
    return subscriptionId;
  }

  stopSubscription(subscriptionId: string): void {
    const socket = this.subscriptionSockets.get(subscriptionId);
    if (!socket) {
      return;
    }

    this.subscriptionSockets.delete(subscriptionId);
    socket.close();
  }

  dispose(): void {
    for (const subscriptionId of this.subscriptionSockets.keys()) {
      this.stopSubscription(subscriptionId);
    }
  }
}
