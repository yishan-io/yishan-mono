import { subscribeDesktopRpcEvent } from "../daemon/daemonAgentProcedures";
import { type DSHFrontendPayload, parseDSHFrontendPayload, parseDSHFrontendRouteIdentity } from "./dshTranscript";

type RouterEntry = {
  sessionId: string;
  token: number;
  onEvent: (payload: DSHFrontendPayload) => void;
  onMalformedPayload: () => void;
};
const routerMap = new Map<string, RouterEntry>();
let nextToken = 1;
let unsubscribeTransport: (() => void) | null = null;

/** Registers a DSH-only frontend event route. DSH events never enter the Pi handler. */
export function registerAgentChatDSHEventRouter(options: {
  tabId: string;
  sessionId: string;
  onEvent: (payload: DSHFrontendPayload) => void;
  onMalformedPayload: () => void;
}): () => void {
  const token = nextToken++;
  routerMap.set(options.tabId, {
    sessionId: options.sessionId,
    token,
    onEvent: options.onEvent,
    onMalformedPayload: options.onMalformedPayload,
  });
  ensureTransport();
  return () => {
    if (routerMap.get(options.tabId)?.token !== token) return;
    routerMap.delete(options.tabId);
    if (routerMap.size === 0) {
      unsubscribeTransport?.();
      unsubscribeTransport = null;
    }
  };
}
function ensureTransport(): void {
  if (unsubscribeTransport) return;
  unsubscribeTransport = subscribeDesktopRpcEvent((envelope) => {
    if (envelope.method !== "agent.dsh.event") return;
    const payload = parseDSHFrontendPayload(envelope.payload);
    if (payload) {
      const entry = routerMap.get(payload.tabId);
      if (entry?.sessionId === payload.sessionId) entry.onEvent(payload);
      return;
    }
    const identity = parseDSHFrontendRouteIdentity(envelope.payload);
    if (!identity) return;
    const entry = routerMap.get(identity.tabId);
    if (entry?.sessionId === identity.sessionId) entry.onMalformedPayload();
  });
}
