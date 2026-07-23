import type { PiEventPayload } from "./agentChatPiEventHelpers";
import { subscribeDesktopRpcEvent } from "../rpc/rpcTransport";

type RouterEntry = {
  sessionId: string;
  token: number;
  onEvent: (payload: PiEventPayload) => void;
};

let nextToken = 1;
const routerMap = new Map<string, RouterEntry>();
let transportUnsubscribe: (() => void) | null = null;
let readinessResolve: (() => void) | null = null;
let readinessPromise: Promise<void> | null = null;

function ensureTransportListener(): void {
  if (transportUnsubscribe) return;

  transportUnsubscribe = subscribeDesktopRpcEvent((envelope) => {
    if (envelope.method !== "agent.pi.event") return;

    const payload = envelope.payload;
    if (!isValidPiEventPayload(payload)) return;

    const entry = routerMap.get(payload.tabId);
    if (!entry) return;
    if (entry.sessionId !== payload.sessionId) return;

    entry.onEvent(payload);
  });

  if (readinessResolve) {
    readinessResolve();
    readinessResolve = null;
    readinessPromise = null;
  }
}

function teardownTransportListenerIfEmpty(): void {
  if (routerMap.size > 0) return;
  transportUnsubscribe?.();
  transportUnsubscribe = null;
  readinessResolve = null;
  readinessPromise = null;
}

function isValidPiEventPayload(payload: unknown): payload is PiEventPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.sessionId === "string" &&
    typeof p.tabId === "string" &&
    typeof p.event === "object" &&
    p.event !== null &&
    !Array.isArray(p.event)
  );
}

/**
 * Registers a tab/session owner for agent.pi.event routing.
 * Returns a token-gated disposer — stale disposers from prior registrations
 * for the same tabId are no-ops.
 */
export function registerAgentChatEventRouter(opts: {
  tabId: string;
  sessionId: string;
  onEvent: (payload: PiEventPayload) => void;
}): () => void {
  const token = nextToken++;
  const entry: RouterEntry = {
    sessionId: opts.sessionId,
    token,
    onEvent: opts.onEvent,
  };

  routerMap.set(opts.tabId, entry);
  ensureTransportListener();

  return () => {
    const current = routerMap.get(opts.tabId);
    if (current?.token !== token) return;
    routerMap.delete(opts.tabId);
    teardownTransportListenerIfEmpty();
  };
}

/**
 * Resolves once the shared desktop-event listener is installed.
 * Safe to call before any registration exists.
 */
export function ensureAgentChatEventRouterReady(): Promise<void> {
  if (transportUnsubscribe) return Promise.resolve();
  if (!readinessPromise) {
    readinessPromise = new Promise<void>((resolve) => {
      readinessResolve = resolve;
    });
  }
  return readinessPromise;
}
