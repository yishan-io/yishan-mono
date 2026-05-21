export type DispatchMessage = {
  runId: string;
  nodeId: string;
  jobId: string;
  projectId: string;
  agentKind: string;
  prompt: string;
  model: string;
  command: string;
  scheduledFor: string;
};

export type QueueEnv = {
  SCHEDULED_JOB_QUEUE?: Queue<DispatchMessage>;
};

/** Maximum number of concurrent Cloudflare Queue sends. */
const QUEUE_SEND_CONCURRENCY = 20;

export async function publishViaQueue(env: QueueEnv, messages: DispatchMessage[]): Promise<number> {
  const queue = env.SCHEDULED_JOB_QUEUE;
  if (!queue) {
    console.warn("[evaluator] SCHEDULED_JOB_QUEUE not configured, skipping dispatch");
    return 0;
  }

  const sem = new Semaphore(QUEUE_SEND_CONCURRENCY);
  const results = await Promise.all(
    messages.map((msg) =>
      sem.run(async () => {
        try {
          await queue.send(msg);
          return true;
        } catch (error) {
          console.error(`[evaluator] Queue publish failed for run ${msg.runId}:`, error);
          return false;
        }
      }),
    ),
  );

  return results.filter(Boolean).length;
}

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
