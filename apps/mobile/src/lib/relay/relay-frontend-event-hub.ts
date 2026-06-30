import type {
  WorkspaceFrontendEventsConnection,
  WorkspaceFrontendEventsMessage,
} from "@/features/workspaces/workspace-frontend-events";
import { generateId } from "@/helpers/generateId";
import { RelayStreamClient } from "./relay-stream-client";

type RelayFrontendEventSubscriber = {
  id: string;
  node: WorkspaceFrontendEventsConnection;
  onMessage: (input: {
    message: WorkspaceFrontendEventsMessage;
    node: WorkspaceFrontendEventsConnection;
  }) => void;
};

type RelayFrontendEventHubEntry = {
  client: RelayStreamClient;
  connectPromise: Promise<void> | null;
  disposed: boolean;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  subscribers: Map<string, RelayFrontendEventSubscriber>;
};

const FRONTEND_EVENT_RECONNECT_DELAY_MS = 2_000;
const relayFrontendEventHub = new Map<string, RelayFrontendEventHubEntry>();

function buildRelayFrontendEventHubKey(accessToken: string, nodeId: string) {
  return `${nodeId}::${accessToken}`;
}

function fanOutRelayFrontendEvent(entry: RelayFrontendEventHubEntry, message: WorkspaceFrontendEventsMessage) {
  for (const subscriber of entry.subscribers.values()) {
    subscriber.onMessage({
      message,
      node: subscriber.node,
    });
  }
}

function clearRelayFrontendReconnect(entry: RelayFrontendEventHubEntry) {
  if (!entry.reconnectTimeoutId) {
    return;
  }

  clearTimeout(entry.reconnectTimeoutId);
  entry.reconnectTimeoutId = null;
}

function closeRelayFrontendEventEntry(key: string, entry: RelayFrontendEventHubEntry) {
  if (relayFrontendEventHub.get(key) !== entry) {
    return;
  }

  entry.disposed = true;
  clearRelayFrontendReconnect(entry);
  relayFrontendEventHub.delete(key);
  entry.client.close();
}

function scheduleRelayFrontendReconnect(key: string, entry: RelayFrontendEventHubEntry) {
  if (entry.disposed || entry.reconnectTimeoutId || entry.subscribers.size === 0) {
    return;
  }

  entry.reconnectTimeoutId = setTimeout(() => {
    entry.reconnectTimeoutId = null;
    void ensureRelayFrontendEventEntryConnected(key, entry);
  }, FRONTEND_EVENT_RECONNECT_DELAY_MS);
}

async function ensureRelayFrontendEventEntryConnected(key: string, entry: RelayFrontendEventHubEntry) {
  if (entry.disposed || entry.subscribers.size === 0) {
    return;
  }

  if (entry.connectPromise) {
    return entry.connectPromise;
  }

  clearRelayFrontendReconnect(entry);

  entry.connectPromise = (async () => {
    await entry.client.connect();
    if (entry.disposed || entry.subscribers.size === 0) {
      entry.client.close();
      return;
    }

    await entry.client.sendRequest("events.frontendStream", {});
    if (entry.disposed || entry.subscribers.size === 0) {
      entry.client.close();
      return;
    }

    fanOutRelayFrontendEvent(entry, { type: "ready" });
  })()
    .catch(() => {
      scheduleRelayFrontendReconnect(key, entry);
    })
    .finally(() => {
      entry.connectPromise = null;
    });

  return entry.connectPromise;
}

function createRelayFrontendEventEntry(input: {
  accessToken: string;
  node: WorkspaceFrontendEventsConnection;
  relayUrl: string;
}) {
  const key = buildRelayFrontendEventHubKey(input.accessToken, input.node.nodeId);
  const entry: RelayFrontendEventHubEntry = {
    client: new RelayStreamClient(
      {
        accessToken: input.accessToken,
        nodeId: input.node.nodeId,
        relayUrl: input.relayUrl,
      },
      {
        onClose: () => {
          if (entry.disposed) {
            return;
          }

          scheduleRelayFrontendReconnect(key, entry);
        },
        onError: () => {
          if (entry.disposed) {
            return;
          }

          scheduleRelayFrontendReconnect(key, entry);
        },
        onFrontendEvent: (event) => {
          fanOutRelayFrontendEvent(entry, {
            payload: event.payload,
            topic: event.topic,
            type: "event",
          });
        },
      },
    ),
    connectPromise: null,
    disposed: false,
    reconnectTimeoutId: null,
    subscribers: new Map(),
  };

  relayFrontendEventHub.set(key, entry);
  return entry;
}

/** Clears the shared frontend-event hub. Used by tests and explicit runtime teardown. */
export function clearRelayFrontendEventHub() {
  for (const [key, entry] of relayFrontendEventHub.entries()) {
    closeRelayFrontendEventEntry(key, entry);
  }
}

/** Shares one relay frontend-event stream per node/access-token pair and fans out to subscribers. */
export function subscribeRelayFrontendEvents(input: {
  accessToken: string;
  node: WorkspaceFrontendEventsConnection;
  onMessage: (input: {
    message: WorkspaceFrontendEventsMessage;
    node: WorkspaceFrontendEventsConnection;
  }) => void;
  relayUrl: string;
}) {
  const key = buildRelayFrontendEventHubKey(input.accessToken, input.node.nodeId);
  const entry = relayFrontendEventHub.get(key) ?? createRelayFrontendEventEntry(input);
  const subscriberId = generateId("relay-sub");

  entry.subscribers.set(subscriberId, {
    id: subscriberId,
    node: input.node,
    onMessage: input.onMessage,
  });

  void ensureRelayFrontendEventEntryConnected(key, entry);

  return () => {
    entry.subscribers.delete(subscriberId);

    if (entry.subscribers.size === 0) {
      closeRelayFrontendEventEntry(key, entry);
    }
  };
}
