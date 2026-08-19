import { delay } from "@renderer/async/delay";

/**
 * Daemon WebSocket session (desktop8 Phase 31).
 *
 * Owns the socket object lifecycle only: open (with retry), close handling,
 * and reconnection scheduling. The RPC client owns semantics (correlation,
 * subscriptions, status listeners) and reacts through the event callbacks.
 */

export type SocketSessionEvents = {
  onMessage: (data: unknown) => void;
  onBinary: (frame: ArrayBuffer) => void;
  onDisconnected: () => void;
};

export class SocketSession {
  private readonly openSocket: () => Promise<WebSocket>;
  private readonly events: SocketSessionEvents;
  private readonly onConnectionStatus: (status: "connected" | "connecting" | "disconnected") => void;
  private socket: WebSocket | null = null;
  private socketOpenPromise: Promise<WebSocket> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: {
    openSocket: () => Promise<WebSocket>;
    events: SocketSessionEvents;
    onConnectionStatus: (status: "connected" | "connecting" | "disconnected") => void;
  }) {
    this.openSocket = options.openSocket;
    this.events = options.events;
    this.onConnectionStatus = options.onConnectionStatus;
  }

  /** The currently open socket, or null while disconnected. */
  getSocket(): WebSocket | null {
    return this.socket;
  }

  /** Opens the socket once (lazy); reuses an in-flight open and returns the socket. */
  async ensureSocket(): Promise<WebSocket> {
    if (this.disposed) {
      throw new Error("daemon websocket client is disposed");
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    if (this.socketOpenPromise) {
      return await this.socketOpenPromise;
    }

    this.onConnectionStatus("connecting");
    this.socketOpenPromise = this.openSocket()
      .then((socket) => {
        this.socket = socket;
        // Enable binary frame reception as ArrayBuffer for the raw frame path.
        socket.binaryType = "arraybuffer";

        socket.addEventListener("message", (event) => {
          if (event.data instanceof ArrayBuffer) {
            this.events.onBinary(event.data);
            return;
          }
          this.events.onMessage(event.data);
        });

        socket.addEventListener("close", () => {
          this.clearSocketReference(socket);
          this.onConnectionStatus("disconnected");
          this.events.onDisconnected();
          this.scheduleReconnect();
        });

        socket.addEventListener("error", () => {
          this.onConnectionStatus("disconnected");
          this.events.onDisconnected();
          this.scheduleReconnect();
        });

        // Emit connected only after the socket listeners are installed so a
        // subscription-restore request cannot race its own response.
        this.onConnectionStatus("connected");

        return socket;
      })
      .catch((error) => {
        this.onConnectionStatus("disconnected");
        throw error;
      })
      .finally(() => {
        this.socketOpenPromise = null;
      });

    return await this.socketOpenPromise;
  }

  /** Closes the socket and stops reconnection. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private clearSocketReference(socket: WebSocket): void {
    if (this.socket === socket) {
      this.socket = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectPromise || this.socketOpenPromise) {
      return;
    }

    this.reconnectPromise = this.ensureSocket()
      .then(() => undefined)
      .catch(() => {
        if (!this.disposed && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.scheduleReconnect();
          }, 1_000);
        }
      })
      .finally(() => {
        this.reconnectPromise = null;
      });
  }
}
