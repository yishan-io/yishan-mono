export type DispatchMessage = {
  runId: string;
  nodeId: string;
  jobId: string;
  agentKind: string;
  prompt: string;
  model: string;
  command: string;
  scheduledFor: string;
};

export type QStashEnv = {
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  RELAY_URL?: string;
  RELAY_API_TOKEN?: string;
};

const DEFAULT_QSTASH_URL = "https://qstash-us-east-1.upstash.io";
const RELAY_DISPATCH_PATH = "/api/v1/dispatch";

/** Maximum number of concurrent QStash publish requests. */
const QSTASH_PUBLISH_CONCURRENCY = 20;

/**
 * Publish scheduled job run messages via Upstash QStash to the relay service.
 *
 * QStash delivers each message to the relay's dispatch endpoint with at-least-once
 * guarantees and automatic retries. The relay then pushes the job to the daemon
 * over its persistent WebSocket connection.
 *
 * Messages are published concurrently (up to QSTASH_PUBLISH_CONCURRENCY at a time)
 * instead of sequentially to avoid consuming the evaluator window on large batches.
 */
export async function publishViaQStash(
  env: QStashEnv,
  messages: DispatchMessage[]
): Promise<number> {
  const token = env.QSTASH_TOKEN;
  const relayURL = env.RELAY_URL;
  const relayAPIToken = env.RELAY_API_TOKEN;

  if (!token) {
    console.warn("[evaluator] QSTASH_TOKEN not configured, skipping dispatch");
    return 0;
  }
  if (!relayURL) {
    console.warn("[evaluator] RELAY_URL not configured, skipping dispatch");
    return 0;
  }

  const qstashURL = env.QSTASH_URL || DEFAULT_QSTASH_URL;
  const destination = `${relayURL}${RELAY_DISPATCH_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(relayAPIToken ? { "Upstash-Forward-Authorization": `Bearer ${relayAPIToken}` } : {}),
  };

  // Publish all messages concurrently with a bounded semaphore.
  const sem = new Semaphore(QSTASH_PUBLISH_CONCURRENCY);
  const results = await Promise.all(
    messages.map((msg) =>
      sem.run(async () => {
        const resp = await fetch(`${qstashURL}/v2/publish/${destination}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            runId: msg.runId,
            jobId: msg.jobId,
            nodeId: msg.nodeId,
            scheduledFor: msg.scheduledFor,
            payload: {
              agentKind: msg.agentKind,
              prompt: msg.prompt,
              model: msg.model,
              command: msg.command,
            },
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error(
            `[evaluator] QStash publish failed for run ${msg.runId}: ${resp.status} ${text}`,
          );
          return false;
        }

        return true;
      }),
    ),
  );

  return results.filter(Boolean).length;
}

/** Minimal async semaphore for bounding concurrent Promises. */
class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.count = concurrency;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}
