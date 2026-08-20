import type { DesktopEventEnvelope } from "../../shared/contracts/desktopEventEnvelope";
import { getDesktopBridge } from "../platform/hostBridge";
import { subscribe } from "../rpc";

/**
 * Desktop RPC event bus (desktop8 Phase 31: event composition moved out of
 * root RPC).
 *
 * Composes the daemon backend-event stream (via the generic RPC `subscribe`
 * operation) and the main-process desktop-bridge events into one envelope
 * listener bus. Root RPC keeps transport only; this module owns the
 * composition, and App Runtime owns daemon identity refresh.
 */

const desktopRpcEventListeners = new Set<(envelope: DesktopEventEnvelope) => void>();
let backendEventsUnsubscribe: (() => void) | null = null;
let desktopBridgeEventsUnsubscribe: (() => void) | null = null;

function emitDesktopRpcEvent(envelope: DesktopEventEnvelope): void {
  for (const listener of desktopRpcEventListeners) {
    listener(envelope);
  }
}

function ensureBackendEventsSubscription(): void {
  if (backendEventsUnsubscribe || desktopRpcEventListeners.size === 0) {
    return;
  }

  // Replace the legacy `events.frontendStream.subscribe` path with the
  // generic RPC subscribe operation (desktop8 Phase 31). The daemon streams
  // frontend events as `{ topic, payload }` in the notification params; the
  // envelope keeps the raw topic/method shape that
  // `app/events/backendEventAdapter.normalizeBackendEvent` expects.
  backendEventsUnsubscribe = subscribe(
    "events.frontendStream",
    undefined,
    (event) => {
      const params = (event.payload ?? {}) as Record<string, unknown>;
      // The daemon sends the streamed event directly in the params
      // (`{ topic, payload }`); tolerate a wrapped `{ result: { topic,
      // payload } }` shape defensively.
      const wrappedResult = params.result;
      const hasWrappedResult = wrappedResult !== null && typeof wrappedResult === "object";
      const streamEvent = (hasWrappedResult ? wrappedResult : params) as { topic?: unknown; payload?: unknown };
      const topic = typeof streamEvent.topic === "string" ? streamEvent.topic : event.method;
      emitDesktopRpcEvent({
        method: topic,
        payload: streamEvent.payload ?? params,
      });
    },
    { registerWithDaemon: true },
  );
}

/**
 * Registers one raw desktop RPC listener and returns one unsubscribe callback.
 * The listener receives daemon backend events and main-process bridge events.
 */
export function subscribeDesktopRpcEvent(listener: (envelope: DesktopEventEnvelope) => void): () => void {
  desktopRpcEventListeners.add(listener);
  desktopBridgeEventsUnsubscribe ??= getDesktopBridge()?.events.subscribe(emitDesktopRpcEvent) ?? null;
  ensureBackendEventsSubscription();

  return () => {
    desktopRpcEventListeners.delete(listener);
    if (desktopRpcEventListeners.size === 0) {
      backendEventsUnsubscribe?.();
      backendEventsUnsubscribe = null;
      desktopBridgeEventsUnsubscribe?.();
      desktopBridgeEventsUnsubscribe = null;
    }
  };
}

/** Emits one desktop RPC envelope to registered listeners (App Runtime use). */
export function emitDesktopRpcEventToBus(envelope: DesktopEventEnvelope): void {
  emitDesktopRpcEvent(envelope);
}

export type { DesktopEventEnvelope } from "../../shared/contracts/desktopEventEnvelope";
