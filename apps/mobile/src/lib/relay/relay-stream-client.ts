import { getErrorMessage } from "@/helpers/errorHelpers";
import { getRelayNodeToken } from "./relay-node-token";
import {
  type RelayJsonRpcMessage,
  RelayRpcError,
  buildRelayJsonRpcRequestMessage,
  buildRelayRequestId,
  buildRelayWebSocketUrl,
  decodeRelayText,
  isLikelyRelayJsonPayload,
  parseRelayJsonMessage,
  readRelayBinaryPayload,
  readRelayBlobTextMessage,
} from "./relay-websocket";

export type RelayStreamEventHandlers = {
  onFrontendEvent?: (event: { payload: Record<string, unknown>; topic: string }) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
  onTerminalExit?: (event: { exitCode: number | null; sessionId: string }) => void;
  onTerminalOutput?: (event: { output: string; sessionId: string }) => void;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const RELAY_TERMINAL_OUTPUT_OPCODE = 0x02;

/** Owns one direct relay websocket connection plus JSON-RPC request tracking. */
export class RelayStreamClient {
  private readonly handlers: RelayStreamEventHandlers;
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | null = null;
  private openPromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly input: {
      accessToken: string;
      nodeId: string;
      relayUrl: string;
    },
    handlers: RelayStreamEventHandlers,
  ) {
    this.handlers = handlers;
  }

  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error("Relay websocket client is closed.");
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.openPromise) {
      return this.openPromise;
    }

    this.openPromise = new Promise<void>((resolve, reject) => {
      void (async () => {
        try {
          const relayToken = await getRelayNodeToken({
            accessToken: this.input.accessToken,
            nodeId: this.input.nodeId,
          });
          if (this.closed || this.openPromise === null) {
            reject(new Error("Relay websocket client is closed."));
            return;
          }

          const socket = new WebSocket(
            buildRelayWebSocketUrl({
              accessToken: relayToken.token,
              nodeId: this.input.nodeId,
              relayUrl: this.input.relayUrl,
            }).toString(),
          );
          this.socket = socket;
          let settled = false;

          const finalize = (callback: () => void) => {
            if (settled) {
              return;
            }

            settled = true;
            this.openPromise = null;
            callback();
          };

          socket.addEventListener("open", () => {
            if (this.closed || this.openPromise === null) {
              socket.close();
              finalize(() => reject(new Error("Relay websocket client is closed.")));
              return;
            }

            this.socket = socket;
            finalize(resolve);
          });

          socket.addEventListener("message", (event) => {
            void this.handleSocketMessage(event.data);
          });

          socket.addEventListener("error", () => {
            const error = new Error("Relay websocket connection failed.");
            if (!settled) {
              finalize(() => reject(error));
              return;
            }

            this.handlers.onError?.(error);
          });

          socket.addEventListener("close", (event) => {
            if (this.socket === socket) {
              this.socket = null;
            }
            this.rejectPending(new Error(event.reason || "Relay websocket closed."));
            if (!settled) {
              finalize(() => reject(new Error(event.reason || "Relay websocket closed before connect.")));
              return;
            }

            if (!this.closed) {
              this.handlers.onClose?.(event);
            }
          });
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(getErrorMessage(error));
          if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.close();
          }
          this.socket = null;
          this.openPromise = null;
          reject(nextError);
        }
      })();
    });

    return this.openPromise;
  }

  async sendRequest<T>(method: string, params: unknown, timeoutMs = 10_000): Promise<T> {
    await this.connect();

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Relay websocket is not connected.");
    }

    const requestId = buildRelayRequestId();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Relay request timed out for ${method}.`));
      }, timeoutMs);

      this.pending.set(requestId, {
        reject,
        resolve: (value) => resolve(value as T),
        timeoutId,
      });

      socket.send(buildRelayJsonRpcRequestMessage({ id: requestId, method, params }));
    });
  }

  close() {
    this.closed = true;
    this.rejectPending(new Error("Relay websocket closed."));
    this.socket?.close();
    this.socket = null;
  }

  private rejectPending(error: Error) {
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private async handleSocketMessage(data: unknown) {
    const blobText = await readRelayBlobTextMessage(data);
    if (blobText !== null) {
      this.handleJsonMessage(blobText);
      return;
    }

    if (typeof data === "string" || data instanceof String) {
      this.handleJsonMessage(typeof data === "string" ? data : data.valueOf());
      return;
    }

    const buffer = await readRelayBinaryPayload(data);
    if (!buffer) {
      return;
    }

    if (isLikelyRelayJsonPayload(buffer)) {
      this.handleJsonMessage(decodeRelayText(buffer));
      return;
    }

    this.handleBinaryMessage(buffer);
  }

  private handleJsonMessage(data: string) {
    let payload: RelayJsonRpcMessage;

    try {
      payload = parseRelayJsonMessage(data);
    } catch (error) {
      this.handlers.onError?.(error instanceof Error ? error : new Error(getErrorMessage(error)));
      return;
    }

    if (payload.id !== undefined && payload.id !== null) {
      const pending = this.pending.get(String(payload.id));
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutId);
      this.pending.delete(String(payload.id));

      if (payload.error) {
        pending.reject(new RelayRpcError(payload.error.code, payload.error.message, payload.error.data));
        return;
      }

      pending.resolve(payload.result);
      return;
    }

    if (payload.method === "terminal.exit") {
      const params = payload.params ?? {};
      const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
      if (!sessionId) {
        return;
      }

      this.handlers.onTerminalExit?.({
        exitCode: typeof params.exitCode === "number" ? params.exitCode : null,
        sessionId,
      });
      return;
    }

    if (payload.method !== "events.frontendStream") {
      return;
    }

    const params = payload.params ?? {};
    const topic = typeof params.topic === "string" ? params.topic : null;
    const eventPayload = params.payload;
    if (!topic || !eventPayload || typeof eventPayload !== "object") {
      return;
    }

    this.handlers.onFrontendEvent?.({
      payload: eventPayload as Record<string, unknown>,
      topic,
    });
  }

  private handleBinaryMessage(buffer: Uint8Array) {
    if (buffer.length < 3 || buffer[0] !== RELAY_TERMINAL_OUTPUT_OPCODE) {
      return;
    }

    let separatorIndex = -1;
    for (let index = 1; index < buffer.length; index += 1) {
      if (buffer[index] === 0) {
        separatorIndex = index;
        break;
      }
    }

    if (separatorIndex === -1) {
      return;
    }

    const sessionId = decodeRelayText(buffer.slice(1, separatorIndex));
    const output = decodeRelayText(buffer.slice(separatorIndex + 1));
    if (!sessionId || !output) {
      return;
    }

    this.handlers.onTerminalOutput?.({ output, sessionId });
  }
}
