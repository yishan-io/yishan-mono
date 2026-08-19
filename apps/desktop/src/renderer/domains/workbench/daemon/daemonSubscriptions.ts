import { subscribeConnectionStatus as subscribeFromTransport } from "@renderer/rpc";

/**
 * Workbench transport subscriptions (desktop7 Phase 27). Domain files must
 * not import root RPC directly; this infrastructure module owns the binding.
 */

export function subscribeDaemonConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return subscribeFromTransport(listener);
}
