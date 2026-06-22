import type { WorkspaceTerminalOutput } from "@/features/workspaces/workspaces.types";
import { getErrorMessage } from "@/helpers/errorHelpers";
import { describeWebSocketMessageData, readWebSocketTextMessage } from "@/lib/api/websocketMessage";

export type TerminalTransportSize = {
  cols: number;
  rows: number;
};

export type TerminalTransportHandlers = {
  onError: (error: Error) => void;
  onMessageDebug?: (payload: unknown) => void;
  onOutput: (output: WorkspaceTerminalOutput & { replace?: boolean }) => void;
  onStateDebug?: (payload: unknown) => void;
};

export type TerminalTransport = {
  connect: () => void;
  dispose: () => void;
  resize: (size: TerminalTransportSize) => Promise<void>;
  send: (input: string) => Promise<void>;
};

type TerminalWebSocketMessage =
  | {
      sessionId: string;
      type: "ready";
    }
  | {
      output: string;
      sessionId: string;
      type: "output";
    }
  | {
      exitCode?: number | null;
      sessionId: string;
      type: "exit";
    }
  | {
      message: string;
      type: "error";
    }
  | {
      type: "pong";
    };

type CreateWebSocketTerminalTransportInput = {
  handlers: TerminalTransportHandlers;
  url: string;
};

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

function parseWebSocketMessage(data: string): TerminalWebSocketMessage {
  return JSON.parse(data) as TerminalWebSocketMessage;
}

export function createWebSocketTerminalTransport({
  handlers,
  url,
}: CreateWebSocketTerminalTransportInput): TerminalTransport {
  const connectTimeoutMs = 8_000;
  let connectionSequence = 0;
  let disposed = false;
  let lastSize: TerminalTransportSize | null = null;
  let lastSentSizeKey: string | null = null;
  let socket: WebSocket | null = null;
  let ready = false;
  let connectPromise: Promise<void> | null = null;
  let terminalExited = false;

  const getSizeKey = (size: TerminalTransportSize) => `${size.cols}x${size.rows}`;

  const cleanupSocket = () => {
    if (!socket) {
      return;
    }

    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.close();
    socket = null;
    ready = false;
    lastSentSizeKey = null;
    connectPromise = null;
  };

  const flushPendingResize = () => {
    if (!ready || socket?.readyState !== WebSocket.OPEN || !lastSize) {
      return;
    }

    const nextSizeKey = getSizeKey(lastSize);
    if (lastSentSizeKey === nextSizeKey) {
      return;
    }

    lastSentSizeKey = nextSizeKey;
    socket.send(JSON.stringify({ ...lastSize, type: "resize" }));
  };

  const handleSocketFailure = (error: Error) => {
    cleanupSocket();

    if (terminalExited) {
      return;
    }

    handlers.onError(error);
  };

  const ensureConnected = async (): Promise<void> => {
    if (disposed) {
      return;
    }

    if (socket?.readyState === WebSocket.OPEN && ready) {
      return;
    }

    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = new Promise<void>((resolve, reject) => {
      const connectionId = ++connectionSequence;
      const WebSocketCtor = globalThis.WebSocket as unknown as ReactNativeWebSocketConstructor;
      const nextSocket = new WebSocketCtor(url);
      let settled = false;

      const settleReady = () => {
        if (settled || socket !== nextSocket) {
          return;
        }

        settled = true;
        ready = true;
        clearTimeout(connectTimeoutId);
        connectPromise = null;
        resolve();
      };

      const settleFailure = (error: Error) => {
        if (settled || socket !== nextSocket) {
          return;
        }

        settled = true;
        clearTimeout(connectTimeoutId);
        connectPromise = null;
        reject(error);
      };

      const connectTimeoutId = setTimeout(() => {
        if (!ready && socket === nextSocket && !settled) {
          handlers.onStateDebug?.({ connectionId, phase: "timeout" });
          nextSocket.close();
          settleFailure(new Error("Terminal websocket connection timed out."));
        }
      }, connectTimeoutMs);

      socket = nextSocket;

      nextSocket.onopen = () => {
        if (socket !== nextSocket) {
          return;
        }

        handlers.onStateDebug?.({ connectionId, phase: "open" });
        if (disposed) {
          cleanupSocket();
        }
      };

      nextSocket.onmessage = (event) => {
        void (async () => {
          try {
            if (disposed || socket !== nextSocket) {
              return;
            }

            handlers.onMessageDebug?.(describeWebSocketMessageData(event.data));

            const payload = await readWebSocketTextMessage(event.data);
            if (payload === null) {
              const payloadError = new Error("Unsupported terminal websocket payload.");
              if (!ready) {
                settleFailure(payloadError);
                return;
              }
              handleSocketFailure(payloadError);
              return;
            }

            const message = parseWebSocketMessage(payload);
            handlers.onStateDebug?.({ connectionId, phase: "message", type: message.type });

            switch (message.type) {
              case "ready":
                settleReady();
                flushPendingResize();
                return;
              case "output": {
                const wasReady = ready;
                if (!wasReady) {
                  settleReady();
                }
                handlers.onOutput({
                  output: message.output,
                  replace: !wasReady,
                  running: true,
                });
                return;
              }
              case "exit":
                if (!ready) {
                  settleReady();
                }
                terminalExited = true;
                handlers.onOutput({
                  exitCode: message.exitCode ?? null,
                  output: "",
                  running: false,
                });
                return;
              case "error": {
                const wsError = new Error(message.message || "Terminal websocket failed.");
                if (!ready) {
                  settleFailure(wsError);
                  return;
                }
                handleSocketFailure(wsError);
                return;
              }
              case "pong":
                return;
            }
          } catch (error) {
            const parsedError = error instanceof Error ? error : new Error(getErrorMessage(error));
            if (!ready) {
              settleFailure(parsedError);
              return;
            }
            handleSocketFailure(parsedError);
            return;
          }
        })();
      };

      nextSocket.onerror = () => {
        if (socket !== nextSocket) {
          return;
        }

        handlers.onStateDebug?.({ connectionId, phase: "error-event" });
        const error = new Error("Terminal websocket failed.");
        if (!ready) {
          settleFailure(error);
          return;
        }
        handleSocketFailure(error);
      };

      nextSocket.onclose = () => {
        if (socket !== nextSocket) {
          return;
        }

        handlers.onStateDebug?.({ connectionId, phase: "close", ready });
        const error = new Error("Terminal websocket closed.");
        if (!ready) {
          settleFailure(error);
          return;
        }

        handleSocketFailure(error);
      };
    }).catch((error) => {
      if (terminalExited) {
        return;
      }

      handlers.onError(error instanceof Error ? error : new Error(getErrorMessage(error)));
    });

    return connectPromise;
  };

  return {
    connect: () => {
      void ensureConnected();
    },
    dispose: () => {
      disposed = true;
      cleanupSocket();
    },
    resize: async (size) => {
      if (disposed || size.cols <= 0 || size.rows <= 0) {
        return;
      }

      lastSize = size;
      await ensureConnected();
      flushPendingResize();
    },
    send: async (input) => {
      if (disposed || !input) {
        return;
      }

      await ensureConnected();
      socket?.send(JSON.stringify({ input, type: "input" }));
    },
  };
}
