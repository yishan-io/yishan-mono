import { DaemonRpcClient, type RpcClientOptions } from "./client";
import { openDaemonSocket } from "./connection";
import type { DaemonNotification } from "./wire";

/**
 * Root RPC public API (desktop8 Phase 31).
 *
 * One transport client owns the daemon WebSocket lifecycle. The public
 * surface is the six operations below; the Client instance, socket,
 * pending-request Map, and subscription Map are never exposed. Domain
 * Infrastructure is the only layer that imports this module (R19).
 */

export type { DaemonNotification } from "./wire";
export type { RpcClientOptions } from "./client";

// The client is constructed eagerly but opens its socket lazily on the first
// request/subscription, so module evaluation has no side effects.
const rpcClient = new DaemonRpcClient({
  openSocket: openDaemonSocket,
} satisfies RpcClientOptions);

/** Resolves one JSON-RPC request with an optional timeout override. */
export function request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
  return rpcClient.request(method, params, timeoutMs);
}

/** Subscribes one listener to daemon notifications matching one method. */
export function subscribe(
  method: string,
  params: unknown,
  listener: (event: DaemonNotification) => void,
  options?: { registerWithDaemon?: boolean },
): () => void {
  return rpcClient.subscribe(method, params, listener, options);
}

/** Sends one raw binary frame (the Terminal Domain owns the frame codec). */
export function sendBinary(frame: Uint8Array): void {
  rpcClient.sendBinary(frame);
}

/** Subscribes one listener to raw incoming binary frames. */
export function subscribeBinary(listener: (frame: ArrayBuffer) => void): () => void {
  return rpcClient.subscribeBinary(listener);
}

/** Subscribes one connection-status listener; the current status is emitted immediately. */
export function subscribeConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return rpcClient.subscribeConnectionStatus(listener);
}

/** Stops all transport resources. */
export function dispose(): void {
  rpcClient.dispose();
}
