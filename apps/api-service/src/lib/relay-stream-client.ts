import {
  type RelayJsonRpcMessage,
  RelayRpcError,
  buildRelayJsonRpcRequestMessage,
  buildRelayRequestId,
  buildRelayWebSocketUrl,
  decodeRelayBinaryPayload,
  decodeRelayText,
  parseRelayJsonMessage,
} from "@/lib/relay-websocket";

type RelayStreamEventHandlers = {
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

export class RelayStreamClient {
  private readonly handlers: RelayStreamEventHandlers;
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | null = null;
  private openPromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly input: {
      apiToken: string;
      nodeId: string;
      relayUrl: string;
    },
    handlers: RelayStreamEventHandlers,
  ) {
    this.handlers = handlers;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.openPromise) {
      return this.openPromise;
    }

    const url = buildRelayWebSocketUrl(this.input);

    this.openPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url.toString());
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
        this.socket = socket;
        finalize(resolve);
      });

      socket.addEventListener("message", (event) => {
        void this.handleSocketMessage(event.data);
      });

      socket.addEventListener("error", () => {
        const error = new Error("Relay websocket connection failed");
        if (!settled) {
          finalize(() => reject(error));
          return;
        }

        this.handlers.onError?.(error);
      });

      socket.addEventListener("close", (event) => {
        this.socket = null;
        this.rejectPending(new Error(event.reason || "Relay websocket closed"));
        if (!settled) {
          finalize(() => reject(new Error(event.reason || "Relay websocket closed before connect")));
          return;
        }

        if (!this.closed) {
          this.handlers.onClose?.(event);
        }
      });
    });

    return this.openPromise;
  }

  async sendRequest<T>(method: string, params: unknown, timeoutMs = 10_000): Promise<T> {
    await this.connect();

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Relay websocket is not connected");
    }

    const requestId = buildRelayRequestId();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Relay request timed out for ${method}`));
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
    this.rejectPending(new Error("Relay websocket closed"));
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
    if (typeof data !== "string" && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      return;
    }

    if (typeof data !== "string") {
      try {
        const buffer = decodeRelayBinaryPayload(data);
        this.handleBinaryMessage(buffer);
      } catch (error) {
        this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    let payload: RelayJsonRpcMessage;

    try {
      payload = parseRelayJsonMessage(data);
    } catch (error) {
      this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
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

    if (payload.method === "events.frontendStream") {
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
    if (!sessionId) {
      return;
    }

    const chunk = decodeRelayText(buffer.slice(separatorIndex + 1));
    if (!chunk) {
      return;
    }

    this.handlers.onTerminalOutput?.({
      output: chunk,
      sessionId,
    });
  }
}
