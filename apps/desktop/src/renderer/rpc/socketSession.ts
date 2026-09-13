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
  onDisconnected: (socket: WebSocket) => void;
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
    let openedSocket: WebSocket | null = null;
    this.socketOpenPromise = this.openSocket()
      .then((socket) => {
        openedSocket = socket;
        if (this.disposed) {
          socket.close();
          throw new Error("daemon websocket client is disposed");
        }
        this.socket = socket;
        // Enable binary frame reception as ArrayBuffer for the raw frame path.
        socket.binaryType = "arraybuffer";

        socket.addEventListener("message", (event) => {
          if (this.socket !== socket) {
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            this.events.onBinary(event.data);
            return;
          }
          this.events.onMessage(event.data);
        });

        socket.addEventListener("close", () => this.invalidateSocket(socket));
        socket.addEventListener("error", () => this.invalidateSocket(socket));

        // Emit connected only after the socket listeners are installed so a
        // subscription-restore request cannot race its own response.
        this.onConnectionStatus("connected");
        if (this.socket !== socket) {
          throw new Error(
            this.disposed ? "daemon websocket client is disposed" : "daemon websocket invalidated while connecting",
          );
        }

        return socket;
      })
      .catch((error) => {
        if (!this.disposed && (openedSocket === null || this.socket === openedSocket)) {
          this.onConnectionStatus("disconnected");
        }
        throw error;
      })
      .finally(() => {
        this.socketOpenPromise = null;
        this.resumeReconnectIfNeeded();
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

  /** Invalidates the active socket and immediately begins replacing it. */
  invalidateSocket(socket: WebSocket): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;
    this.onConnectionStatus("disconnected");
    this.events.onDisconnected(socket);
    socket.close();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectPromise || this.socketOpenPromise) {
      return;
    }

    this.reconnectPromise = this.ensureSocket()
      .then(() => undefined)
      .catch(() => {
        this.scheduleReconnectAfterDelay();
      })
      .finally(() => {
        this.reconnectPromise = null;
        this.resumeReconnectIfNeeded();
      });
  }

  private resumeReconnectIfNeeded(): void {
    if (!this.disposed && !this.socket && !this.reconnectTimer) {
      this.scheduleReconnectAfterDelay();
    }
  }

  private scheduleReconnectAfterDelay(): void {
    if (this.disposed || this.socket || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.scheduleReconnect();
    }, 1_000);
  }
}
