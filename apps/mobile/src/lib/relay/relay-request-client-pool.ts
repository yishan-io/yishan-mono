import { RelayStreamClient } from "./relay-stream-client";

type RelayRequestClientKey = string;

type RelayRequestClientEntry = {
  client: RelayStreamClient;
  idleTimeoutId: ReturnType<typeof setTimeout> | null;
  refCount: number;
};

const REQUEST_CLIENT_IDLE_CLOSE_MS = 5_000;
const relayRequestClientPool = new Map<RelayRequestClientKey, RelayRequestClientEntry>();

function buildRelayRequestClientKey(accessToken: string, nodeId: string) {
  return `${nodeId}::${accessToken}`;
}

function disposeRelayRequestClient(key: RelayRequestClientKey, entry: RelayRequestClientEntry) {
  if (relayRequestClientPool.get(key) !== entry) {
    return;
  }

  if (entry.idleTimeoutId) {
    clearTimeout(entry.idleTimeoutId);
    entry.idleTimeoutId = null;
  }

  relayRequestClientPool.delete(key);
  entry.client.close();
}

function createRelayRequestClientEntry(input: { accessToken: string; nodeId: string; relayUrl: string }) {
  const key = buildRelayRequestClientKey(input.accessToken, input.nodeId);
  const entry: RelayRequestClientEntry = {
    client: new RelayStreamClient(
      {
        accessToken: input.accessToken,
        nodeId: input.nodeId,
        relayUrl: input.relayUrl,
      },
      {
        onClose: () => {
          relayRequestClientPool.delete(key);
        },
      },
    ),
    idleTimeoutId: null,
    refCount: 0,
  };

  relayRequestClientPool.set(key, entry);
  return entry;
}

function acquireRelayRequestClient(input: { accessToken: string; nodeId: string; relayUrl: string }) {
  const key = buildRelayRequestClientKey(input.accessToken, input.nodeId);
  const entry = relayRequestClientPool.get(key) ?? createRelayRequestClientEntry(input);

  if (entry.idleTimeoutId) {
    clearTimeout(entry.idleTimeoutId);
    entry.idleTimeoutId = null;
  }

  entry.refCount += 1;

  return {
    client: entry.client,
    release: () => {
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (entry.refCount > 0 || entry.idleTimeoutId) {
        return;
      }

      entry.idleTimeoutId = setTimeout(() => {
        entry.idleTimeoutId = null;
        disposeRelayRequestClient(key, entry);
      }, REQUEST_CLIENT_IDLE_CLOSE_MS);
    },
  };
}

/** Clears all pooled request clients. Used by tests and explicit runtime teardown. */
export function clearRelayRequestClientPool() {
  for (const [key, entry] of relayRequestClientPool.entries()) {
    disposeRelayRequestClient(key, entry);
  }
}

/** Reuses one direct relay request client per node/access-token pair with idle close semantics. */
export async function withPooledRelayRequestClient<T>(
  input: {
    accessToken: string;
    nodeId: string;
    relayUrl: string;
  },
  action: (client: RelayStreamClient) => Promise<T>,
): Promise<T> {
  const lease = acquireRelayRequestClient(input);

  try {
    await lease.client.connect();
    return await action(lease.client);
  } finally {
    lease.release();
  }
}
