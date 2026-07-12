import type { DesktopBridge, DesktopHostBridge, DesktopRpcEventEnvelope } from "../../main/ipc";
import { DaemonClient } from "./daemonClient";
import type { ApiNamespace } from "./daemonTypes";
import { delay } from "./helpers";
import type { ApiSubscriptionHandlers, DaemonRpcClient } from "./types";

type DesktopRpcEventListener = (envelope: DesktopRpcEventEnvelope) => void;
type DaemonConnectionStatus = "connected" | "connecting" | "disconnected";

const SOCKET_CONNECT_RETRY_COUNT = 30;
const SOCKET_CONNECT_RETRY_DELAY_MS = 500;
const API_NAMESPACES = new Set<ApiNamespace>([
  "app",
  "computer",
  "context",
  "workspace",
  "file",
  "git",
  "terminal",
  "chat",
  "agent",
  "cliTools",
  "integration",
  "notification",
  "events",
  "skill",
  "memory",
  "pi",
]);
const desktopRpcEventListeners = new Set<DesktopRpcEventListener>();
const daemonConnectionStatusListeners = new Set<(status: DaemonConnectionStatus) => void>();
let backendEventsSubscription: { unsubscribe: () => void } | null = null;
let backendEventsSubscriptionPromise: Promise<void> | null = null;
let desktopBridgeEventsUnsubscribe: (() => void) | null = null;
let daemonRpcClientPromise: Promise<DaemonRpcClient> | null = null;
let daemonTransportClientPromise: Promise<DaemonClient> | null = null;
let daemonWsUrlPromise: Promise<string> | null = null;
let daemonConnectionStatus: DaemonConnectionStatus = "connecting";

function emitDaemonConnectionStatus(status: DaemonConnectionStatus): void {
  daemonConnectionStatus = status;
  for (const listener of daemonConnectionStatusListeners) {
    listener(status);
  }

  emitDesktopRpcEvent({
    method: "daemon.connection.status",
    payload: { status },
  });
}

function invalidateDaemonDiscovery(): void {
  daemonWsUrlPromise = null;
}

async function getDaemonWsUrl(): Promise<string> {
  if (!daemonWsUrlPromise) {
    daemonWsUrlPromise = getDesktopHostBridge()
      .getDaemonInfo()
      .then((info) => {
        const wsUrl = info.wsUrl?.trim();
        if (!wsUrl) {
          throw new Error("Daemon websocket endpoint is unavailable.");
        }
        return wsUrl;
      })
      .catch((error) => {
        daemonWsUrlPromise = null;
        throw error;
      });
  }

  return await daemonWsUrlPromise;
}

async function openSocketWithRetry(): Promise<WebSocket> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SOCKET_CONNECT_RETRY_COUNT; attempt += 1) {
    try {
      invalidateDaemonDiscovery();
      const wsUrl = await getDaemonWsUrl();
      return await new Promise<WebSocket>((resolvePromise, rejectPromise) => {
        const socket = new WebSocket(wsUrl);
        let settled = false;

        const resolveOnce = (value: WebSocket) => {
          if (settled) {
            return;
          }
          settled = true;
          resolvePromise(value);
        };

        const rejectOnce = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          rejectPromise(error);
        };

        socket.addEventListener("open", () => {
          resolveOnce(socket);
        });

        socket.addEventListener("error", () => {
          rejectOnce(new Error("failed to connect to daemon websocket"));
        });

        socket.addEventListener("close", () => {
          rejectOnce(new Error("daemon websocket closed before opening"));
        });
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("failed to connect to daemon websocket");
      if (attempt === SOCKET_CONNECT_RETRY_COUNT) {
        break;
      }

      await delay(SOCKET_CONNECT_RETRY_DELAY_MS);
    }
  }

  throw lastError ?? new Error("failed to connect to daemon websocket");
}

async function getDaemonTransportClient(): Promise<DaemonClient> {
  if (!daemonTransportClientPromise) {
    daemonTransportClientPromise = Promise.resolve(
      new DaemonClient({
        openSocket: openSocketWithRetry,
        onConnectionEvent: (event) => {
          if (event === "connected") {
            emitDaemonConnectionStatus("connected");
            void refreshDaemonIdentity();
            return;
          }

          if (event === "connecting") {
            emitDaemonConnectionStatus("connecting");
            return;
          }

          invalidateDaemonDiscovery();
          emitDaemonConnectionStatus("disconnected");
        },
      }),
    );
  }

  return await daemonTransportClientPromise;
}

async function refreshDaemonIdentity(): Promise<void> {
  try {
    const info = await getDesktopHostBridge().getDaemonInfo();
    emitDesktopRpcEvent({
      method: "daemon.info.refreshed",
      payload: info,
    });
  } catch (error) {
    emitDesktopRpcEvent({
      method: "daemon.info.error",
      payload: { error },
    });
  }
}

/** Emits one raw desktop RPC envelope to registered listeners. */
function emitDesktopRpcEvent(envelope: DesktopRpcEventEnvelope): void {
  for (const listener of desktopRpcEventListeners) {
    listener(envelope);
  }
}

/** Registers one daemon connection status listener and returns one unsubscribe callback. */
export function subscribeDaemonConnectionStatus(listener: (status: DaemonConnectionStatus) => void): () => void {
  daemonConnectionStatusListeners.add(listener);
  listener(daemonConnectionStatus);

  return () => {
    daemonConnectionStatusListeners.delete(listener);
  };
}

function formatSubscriptionEventData(method: string, payload: unknown): unknown {
  if (method === "terminal.output" && payload && typeof payload === "object") {
    return {
      type: "output",
      ...(payload as Record<string, unknown>),
    };
  }

  if (method === "terminal.exit" && payload && typeof payload === "object") {
    return {
      type: "exit",
      ...(payload as Record<string, unknown>),
    };
  }

  return payload;
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

/** Invokes one daemon procedure directly over websocket. */
async function invokeDaemonProcedure(path: string, input?: unknown): Promise<unknown> {
  const parsed = parseProcedurePath(path);
  if (!parsed) {
    throw new Error(`Unsupported API procedure path: ${path}`);
  }

  const daemonClient = await getDaemonTransportClient();
  return await daemonClient.invokeApi({
    namespace: parsed.namespace,
    method: parsed.method,
    input,
  });
}

/** Starts one daemon subscription and returns one unsubscribe handle. */
async function subscribeDaemonProcedure(
  path: string,
  input: unknown,
  handlers: ApiSubscriptionHandlers,
): Promise<() => void> {
  const parsed = parseProcedurePath(path);
  if (!parsed) {
    throw new Error(`Unsupported API subscription path: ${path}`);
  }

  const daemonClient = await getDaemonTransportClient();
  const subscriptionId = await daemonClient.startSubscription({
    namespace: parsed.namespace,
    method: parsed.method,
    input,
    onNotification: (notification) => {
      handlers.onData(formatSubscriptionEventData(notification.method, notification.payload));
      emitDesktopRpcEvent({
        method: notification.method,
        payload: notification.payload,
      });
    },
  });

  return () => {
    daemonClient.stopSubscription(subscriptionId);
  };
}

function parseProcedurePath(path: string): { namespace: ApiNamespace; method: string } | null {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const namespace = segments[0];
  if (!API_NAMESPACES.has(namespace as ApiNamespace)) {
    return null;
  }

  return {
    namespace: namespace as ApiNamespace,
    method: segments.slice(1).join("."),
  };
}

/** Builds one dynamic RPC path proxy for one dotted-path prefix. */
function createRpcPathProxy(pathSegments: string[]): unknown {
  const callable = async (input?: unknown) => {
    const path = pathSegments.join(".");
    if (!path) {
      throw new Error("API procedure path is required");
    }

    return await invokeDaemonProcedure(path, input);
  };

  return new Proxy(callable, {
    get(_target, property) {
      if (property === "then") {
        return undefined;
      }

      if (property === "subscribe") {
        return (input: unknown, handlers: ApiSubscriptionHandlers) => {
          const stopPromise = subscribeDaemonProcedure(pathSegments.join("."), input, handlers);
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

      return createRpcPathProxy([...pathSegments, property]);
    },
    apply(_target, _thisArg, argArray) {
      const path = pathSegments.join(".");
      if (!path) {
        return Promise.reject(new Error("API procedure path is required"));
      }

      return invokeDaemonProcedure(path, argArray[0]);
    },
  });
}

/** Returns one cached dynamic API client for renderer commands. */
export async function getDaemonClient(): Promise<DaemonRpcClient> {
  if (!daemonRpcClientPromise) {
    daemonRpcClientPromise = getDaemonTransportClient().then<DaemonRpcClient>((transportClient) => {
      const proxyClient = createRpcPathProxy([]) as DaemonRpcClient;
      return {
        app: proxyClient.app,
        computer: proxyClient.computer,
        workspace: transportClient.workspace,
        file: transportClient.file,
        git: transportClient.git,
        terminal: {
          createSession: (input) => transportClient.terminal.createSession(input),
          writeInput: transportClient.terminal.writeInput,
          resize: transportClient.terminal.resize,
          readOutput: transportClient.terminal.readOutput,
          closeSession: transportClient.terminal.closeSession,
          killProcess: transportClient.terminal.killProcess,
          listDetectedPorts: transportClient.terminal.listDetectedPorts,
          setActiveWorkspace: transportClient.terminal.setActiveWorkspace,
          getResourceUsage: transportClient.terminal.getResourceUsage,
          listSessions: transportClient.terminal.listSessions,
          subscribeOutput: proxyClient.terminal.subscribeOutput,
          subscribeSessions: proxyClient.terminal.subscribeSessions,
        },
        chat: proxyClient.chat,
        agent: proxyClient.agent,
        cliTools: proxyClient.cliTools,
        integration: proxyClient.integration,
        notification: proxyClient.notification,
        events: proxyClient.events,
        skill: proxyClient.skill,
        memory: proxyClient.memory,
        pi: proxyClient.pi,
        context: {
          getState: () => transportClient.context.getState(),
          setCurrentOrg: (orgId: string) => transportClient.context.setCurrentOrg(orgId),
          setActiveProject: (projectId: string) => transportClient.context.setActiveProject(projectId),
          setActiveFile: (filePath: string) => transportClient.context.setActiveFile(filePath),
        },
      };
    });
    void daemonRpcClientPromise.then(() => {
      emitDaemonConnectionStatus("connected");
      void refreshDaemonIdentity();
    });
  }

  return await daemonRpcClientPromise;
}

/** Ensures one backend event stream subscription while desktop RPC listeners are active. */
async function ensureBackendEventsSubscription(): Promise<void> {
  if (backendEventsSubscription || desktopRpcEventListeners.size === 0) {
    return;
  }

  if (backendEventsSubscriptionPromise) {
    await backendEventsSubscriptionPromise;
    return;
  }

  backendEventsSubscriptionPromise = (async () => {
    if (backendEventsSubscription || desktopRpcEventListeners.size === 0) {
      return;
    }

    const client = await getDaemonClient();
    if (backendEventsSubscription || desktopRpcEventListeners.size === 0) {
      return;
    }

    const nextSubscription = client.events.frontendStream.subscribe(undefined, {
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

    if (desktopRpcEventListeners.size === 0) {
      nextSubscription.unsubscribe();
      return;
    }

    backendEventsSubscription = nextSubscription;
  })().finally(() => {
    backendEventsSubscriptionPromise = null;
  });

  await backendEventsSubscriptionPromise;
}

/** Registers one raw desktop RPC listener and returns one unsubscribe callback. */
export function subscribeDesktopRpcEvent(listener: DesktopRpcEventListener): () => void {
  desktopRpcEventListeners.add(listener);
  desktopBridgeEventsUnsubscribe ??= getDesktopBridge()?.events.subscribe(emitDesktopRpcEvent) ?? null;
  void ensureBackendEventsSubscription();

  return () => {
    desktopRpcEventListeners.delete(listener);
    if (desktopRpcEventListeners.size === 0) {
      backendEventsSubscription?.unsubscribe();
      backendEventsSubscription = null;
      backendEventsSubscriptionPromise = null;
      desktopBridgeEventsUnsubscribe?.();
      desktopBridgeEventsUnsubscribe = null;
    }
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    backendEventsSubscription?.unsubscribe();
    backendEventsSubscription = null;
    backendEventsSubscriptionPromise = null;
    desktopBridgeEventsUnsubscribe?.();
    desktopBridgeEventsUnsubscribe = null;
  });
}
