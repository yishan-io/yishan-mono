import type {
  DesktopApiNamespace,
  DesktopBridge,
  DesktopHostBridge,
  DesktopRpcEventEnvelope,
} from "../../main/ipc";

type DesktopRpcEventListener = (envelope: DesktopRpcEventEnvelope) => void;
type ApiSubscriptionHandlers = {
  onData: (event: unknown) => void;
  onError?: (error: unknown) => void;
};
// biome-ignore lint/suspicious/noExplicitAny: transitional dynamic RPC shape during API migration.
type ApiServiceClient = any;

const API_RPC_SUBSCRIPTION_EVENT_METHOD = "apiRpc.subscription";
const desktopRpcEventListeners = new Set<DesktopRpcEventListener>();
const apiSubscriptionHandlersById = new Map<string, ApiSubscriptionHandlers>();
let bridgeSubscription: (() => void) | null = null;
let backendEventsSubscription: { unsubscribe: () => void } | null = null;
let apiServiceClientPromise: Promise<ApiServiceClient> | null = null;

/** Returns true when one unknown payload is one subscription envelope payload. */
function isApiSubscriptionEnvelopePayload(payload: unknown): payload is {
  subscriptionId: string;
  data: unknown;
} {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as { subscriptionId?: unknown }).subscriptionId === "string" &&
      "data" in (payload as Record<string, unknown>),
  );
}

/** Emits one raw desktop RPC envelope to registered listeners. */
function emitDesktopRpcEvent(envelope: DesktopRpcEventEnvelope): void {
  for (const listener of desktopRpcEventListeners) {
    listener(envelope);
  }
}

/** Handles one internal API subscription bridge envelope and returns true when consumed. */
function tryHandleApiSubscriptionEnvelope(envelope: DesktopRpcEventEnvelope): boolean {
  if (envelope.method !== API_RPC_SUBSCRIPTION_EVENT_METHOD) {
    return false;
  }

  if (!isApiSubscriptionEnvelopePayload(envelope.payload)) {
    return true;
  }

  const handlers = apiSubscriptionHandlersById.get(envelope.payload.subscriptionId);
  if (!handlers) {
    return true;
  }

  handlers.onData(envelope.payload.data);
  return true;
}

/** Returns one preload-provided desktop bridge object when available. */
export function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as typeof window & { __YISHAN__?: DesktopBridge }).__YISHAN__;
}

/** Returns one preload-provided desktop host bridge for shell-only capabilities. */
export function getDesktopHostBridge(): DesktopHostBridge {
  const host = getDesktopBridge()?.host;
  if (!host) {
    throw new Error("Desktop host bridge is unavailable.");
  }

  return host;
}

/** Ensures one active desktop-bridge IPC subscription while listeners are registered. */
function ensureBridgeSubscription(): void {
  if (bridgeSubscription || desktopRpcEventListeners.size === 0) {
    return;
  }

  const bridge = getDesktopBridge();
  if (!bridge?.subscribeDesktopRpcEvent) {
    return;
  }

  bridgeSubscription = bridge.subscribeDesktopRpcEvent((envelope) => {
    if (tryHandleApiSubscriptionEnvelope(envelope)) {
      return;
    }

    emitDesktopRpcEvent(envelope);
  });
}

/** Invokes one api-service query/mutation procedure through preload bridge IPC. */
async function invokeApiProcedure(
  path: string,
  procedureKind: "query" | "mutation",
  input?: unknown,
): Promise<unknown> {
  const apiBridge = getDesktopBridge()?.api;
  if (!apiBridge) {
    throw new Error("Desktop api-service bridge is unavailable");
  }

  const parsed = parseProcedurePath(path);
  if (!parsed) {
    throw new Error(`Unsupported API procedure path: ${path}`);
  }

  return await apiBridge.invoke({
    namespace: parsed.namespace,
    method: parsed.method,
    procedureKind,
    input,
  });
}

/** Starts one subscription bridge for one api-service path and returns one unsubscribe handle. */
async function subscribeApiProcedure(
  path: string,
  input: unknown,
  handlers: ApiSubscriptionHandlers,
): Promise<() => void> {
  const apiBridge = getDesktopBridge()?.api;
  if (!apiBridge) {
    throw new Error("Desktop api-service bridge is unavailable");
  }

  if (path === "events.stream") {
    return () => {};
  }

  const parsed = parseProcedurePath(path);
  if (!parsed) {
    throw new Error(`Unsupported API subscription path: ${path}`);
  }

  const { subscriptionId } = await apiBridge.startSubscription({
    namespace: parsed.namespace,
    method: parsed.method,
    input,
  });
  apiSubscriptionHandlersById.set(subscriptionId, handlers);

  return () => {
    apiSubscriptionHandlersById.delete(subscriptionId);
    void apiBridge.stopSubscription({
      subscriptionId,
    });
  };
}

function parseProcedurePath(path: string): { namespace: DesktopApiNamespace; method: string } | null {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const namespace = segments[0];
  if (namespace !== "workspace" && namespace !== "file" && namespace !== "git" && namespace !== "terminal") {
    return null;
  }

  return {
    namespace,
    method: segments.slice(1).join("."),
  };
}

/** Builds one dynamic procedure proxy node for one dotted-path prefix. */
function createProcedureProxy(pathSegments: string[]): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return undefined;
        }

        if (property === "query") {
          return async (input?: unknown) => {
            return await invokeApiProcedure(pathSegments.join("."), "query", input);
          };
        }

        if (property === "mutate") {
          return async (input?: unknown) => {
            return await invokeApiProcedure(pathSegments.join("."), "mutation", input);
          };
        }

        if (property === "subscribe") {
          return (input: unknown, handlers: ApiSubscriptionHandlers) => {
            const stopPromise = subscribeApiProcedure(pathSegments.join("."), input, handlers);
            return {
              unsubscribe: () => {
                void stopPromise.then((stop) => {
                  stop();
                });
              },
            };
          };
        }

        if (typeof property !== "string") {
          return undefined;
        }

        return createProcedureProxy([...pathSegments, property]);
      },
    },
  );
}

/** Creates one dynamic API client that mirrors the expected tRPC query/mutation/subscription shape. */
async function createApiServiceClient(): Promise<ApiServiceClient> {
  return createProcedureProxy([]);
}

/** Returns one cached dynamic API client for renderer commands. */
export async function getApiServiceClient(): Promise<ApiServiceClient> {
  if (!apiServiceClientPromise) {
    apiServiceClientPromise = createApiServiceClient();
  }

  return await apiServiceClientPromise;
}

/** Ensures one backend event stream subscription while desktop RPC listeners are active. */
async function ensureBackendEventsSubscription(): Promise<void> {
  if (backendEventsSubscription || desktopRpcEventListeners.size === 0) {
    return;
  }

  const client = await getApiServiceClient();
  backendEventsSubscription = client.events.stream.subscribe(undefined, {
    onData: (event: { topic: string; payload: unknown }) => {
      emitDesktopRpcEvent({
        method: event.topic,
        payload: event.payload,
      });
    },
    onError: (error: unknown) => {
      backendEventsSubscription = null;
      if (desktopRpcEventListeners.size > 0) {
        void ensureBackendEventsSubscription();
      }

      emitDesktopRpcEvent({
        method: "apiRpc.events.error",
        payload: { error },
      });
    },
  });
}

/** Registers one raw desktop RPC listener and returns one unsubscribe callback. */
export function subscribeDesktopRpcEvent(listener: DesktopRpcEventListener): () => void {
  desktopRpcEventListeners.add(listener);
  ensureBridgeSubscription();
  void ensureBackendEventsSubscription();

  return () => {
    desktopRpcEventListeners.delete(listener);
    if (desktopRpcEventListeners.size === 0) {
      backendEventsSubscription?.unsubscribe();
      backendEventsSubscription = null;
      bridgeSubscription?.();
      bridgeSubscription = null;
    }
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    backendEventsSubscription?.unsubscribe();
    backendEventsSubscription = null;
  });
}
