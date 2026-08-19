import { SocketSession, type SocketSessionEvents } from "./socketSession";
import { buildRequest, parseJsonRpcMessage, type DaemonNotification } from "./wire";

const RPC_REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ActiveSubscription = {
  method: string;
  params?: unknown;
  onNotification: (event: DaemonNotification) => void;
  /** True when the daemon must receive the method request to stream events. */
  registerWithDaemon: boolean;
};

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export type RpcClientOptions = {
  openSocket: () => Promise<WebSocket>;
};

/**
 * One daemon JSON-RPC transport client (desktop8 Phase 31).
 *
 * Owns transport semantics only: request correlation/timeouts, generic
 * method subscriptions, raw binary frames, and connection-status listeners.
 * The socket object lifecycle lives in `SocketSession`; domain adapters own
 * their caches, payload validation, and frame codecs and never reach into
 * this client's internals.
 */
export class DaemonRpcClient {
  private readonly socketSession: SocketSession;
  private readonly pendingRequestsById = new Map<string, PendingRequest>();
  private readonly subscriptionsById = new Map<string, ActiveSubscription>();
  private readonly binaryListeners = new Set<(frame: ArrayBuffer) => void>();
  private readonly connectionStatusListeners = new Set<(status: ConnectionStatus) => void>();
  private connectionStatus: ConnectionStatus = "connecting";
  private needsSubscriptionRestore = false;
  private disposed = false;

  constructor(options: RpcClientOptions) {
    const events: SocketSessionEvents = {
      onMessage: (data) => this.handleSocketMessage(data),
      onBinary: (frame) => this.handleBinaryFrame(frame),
      onDisconnected: () => this.rejectAllPendingRequests("daemon websocket closed"),
    };
    this.socketSession = new SocketSession({
      openSocket: options.openSocket,
      events,
      onConnectionStatus: (status) => this.emitConnectionStatus(status),
    });
  }

  /** Correlates one JSON-RPC request and resolves/rejects on response or timeout. */
  async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const socket = await this.socketSession.ensureSocket();
    const request = buildRequest(method, params);
    const requestTimeoutMs = timeoutMs ?? RPC_REQUEST_TIMEOUT_MS;

    return await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        if (!this.pendingRequestsById.has(request.id)) {
          return;
        }

        this.pendingRequestsById.delete(request.id);
        rejectPromise(new Error(`daemon RPC request timed out for method "${method}"`));
      }, requestTimeoutMs);

      this.pendingRequestsById.set(request.id, {
        method,
        timeout,
        resolve: resolvePromise,
        reject: rejectPromise,
      });

      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        const pending = this.pendingRequestsById.get(request.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequestsById.delete(request.id);
        }
        rejectPromise(error instanceof Error ? error : new Error(`failed to send daemon RPC method "${method}"`));
      }
    });
  }

  /**
   * Subscribes one listener to daemon notifications matching one method.
   * By default the method request is sent to the daemon to establish the
   * stream; pass `registerWithDaemon: false` for notifications the daemon
   * pushes unsolicited. Returns the removal function.
   */
  subscribe(
    method: string,
    params: unknown,
    onNotification: (event: DaemonNotification) => void,
    options?: { registerWithDaemon?: boolean },
  ): () => void {
    const registerWithDaemon = options?.registerWithDaemon ?? true;
    const subscriptionId = `sub-${Math.random().toString(36).slice(2)}`;
    this.subscriptionsById.set(subscriptionId, {
      method,
      params,
      onNotification,
      registerWithDaemon,
    });

    if (registerWithDaemon) {
      void this.sendSubscriptionRequest(method, params);
    }

    return () => {
      this.subscriptionsById.delete(subscriptionId);
    };
  }

  /** Sends one raw binary frame (the Terminal Domain owns the frame codec). */
  sendBinary(frame: Uint8Array): void {
    const socket = this.socketSession.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(frame as unknown as Blob);
    } catch {
      // Best-effort: silently drop if socket is in a bad state.
    }
  }

  /** Subscribes one listener to raw incoming binary frames. Returns the removal function. */
  subscribeBinary(listener: (frame: ArrayBuffer) => void): () => void {
    this.binaryListeners.add(listener);
    return () => {
      this.binaryListeners.delete(listener);
    };
  }

  /** Subscribes one connection-status listener; the current status is emitted immediately. */
  subscribeConnectionStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionStatusListeners.add(listener);
    listener(this.connectionStatus);
    return () => {
      this.connectionStatusListeners.delete(listener);
    };
  }

  /** Stops all resources: pending requests, subscriptions, binary listeners, and the socket. */
  dispose(): void {
    this.disposed = true;
    for (const requestId of this.pendingRequestsById.keys()) {
      const pending = this.pendingRequestsById.get(requestId);
      if (!pending) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject(new Error(`daemon websocket client disposed while calling method "${pending.method}"`));
    }
    this.pendingRequestsById.clear();
    this.subscriptionsById.clear();
    this.binaryListeners.clear();
    this.connectionStatusListeners.clear();
    this.socketSession.dispose();
  }

  // ─── Internal wiring ────────────────────────────────────────────────────────

  private async sendSubscriptionRequest(method: string, params?: unknown): Promise<void> {
    try {
      await this.request(method, params);
    } catch {
      // A later reconnect attempt will re-register subscriptions again.
    }
  }

  private rejectAllPendingRequests(reason: string): void {
    for (const [requestId, pending] of this.pendingRequestsById.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${reason} while calling method "${pending.method}"`));
      this.pendingRequestsById.delete(requestId);
    }
  }

  private emitConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    for (const listener of this.connectionStatusListeners) {
      listener(status);
    }
    if (status === "disconnected") {
      this.needsSubscriptionRestore = true;
    } else if (status === "connected" && this.needsSubscriptionRestore && !this.disposed) {
      // Re-register daemon subscriptions only after a disconnect; the first
      // connect never races subscribe()'s own registration request.
      this.needsSubscriptionRestore = false;
      this.restoreDaemonSubscriptions();
    }
  }

  private restoreDaemonSubscriptions(): void {
    for (const subscription of this.subscriptionsById.values()) {
      if (!subscription.registerWithDaemon) {
        continue;
      }
      void this.sendSubscriptionRequest(subscription.method, subscription.params);
    }
  }

  private handleSocketMessage(data: unknown): void {
    let message: ReturnType<typeof parseJsonRpcMessage>;
    try {
      message = parseJsonRpcMessage(data);
    } catch {
      return;
    }

    if ("method" in message) {
      this.dispatchNotification({
        method: message.method,
        payload: message.params,
      });
      return;
    }

    const responseId = message.id;
    if (!responseId) {
      return;
    }

    const pending = this.pendingRequestsById.get(responseId);
    if (!pending) {
      return;
    }

    this.pendingRequestsById.delete(responseId);
    clearTimeout(pending.timeout);

    if (message.error) {
      const error = new Error(message.error.message || `daemon RPC error ${message.error.code}`) as Error & {
        code?: number;
      };
      error.code = message.error.code;
      pending.reject(error);
      return;
    }

    pending.resolve(message.result);
  }

  private dispatchNotification(event: DaemonNotification): void {
    for (const subscription of this.subscriptionsById.values()) {
      if (subscription.method !== event.method) {
        continue;
      }
      subscription.onNotification(event);
    }
  }

  private handleBinaryFrame(frame: ArrayBuffer): void {
    for (const listener of this.binaryListeners) {
      listener(frame);
    }
  }
}
