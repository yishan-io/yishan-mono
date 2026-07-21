import type { AgentRecord, AgentResult, AgentTask } from "../agents/types";
import { emptyAgentUsageStats } from "../agents/types";
import { type AgentRunHandle, type StartAgentRunOptions, startAgentRun } from "./agentRunner";
import { ConcurrencyQueue, QueuedTaskCancelledError } from "./concurrencyQueue";
import { formatResultCollectorOutput } from "./resultCollector";

const DEFAULT_MAX_CONCURRENCY = 16;
const AGENT_ID_PREFIX = "agent";
const MANAGER_SHUTDOWN_ERROR = "Agent manager is shut down";

/** Configurable dependencies for the shared agent manager. */
export interface AgentManagerOptions {
  maxConcurrency?: number;
  now?: () => number;
  createAgentRun?: (options: StartAgentRunOptions) => Promise<AgentRunHandle>;
}

/** Snapshot listener notified whenever tracked agent state changes. */
export type AgentManagerListener = (records: AgentRecord[]) => void;

/** Optional controls for one started agent run. */
export interface AgentRunRequestOptions {
  signal?: AbortSignal;
}

interface RunningAgentState {
  handle?: AgentRunHandle;
  stopRequested: boolean;
}

/**
 * Shared lifecycle manager for foreground, background, and parallel agent runs.
 */
export class AgentManager {
  private readonly createAgentRun;
  private readonly now;
  private readonly queue: ConcurrencyQueue;
  private readonly agentRecords = new Map<string, AgentRecord>();
  private readonly queuedCancels = new Map<string, () => boolean>();
  private readonly runningAgentStates = new Map<string, RunningAgentState>();
  private readonly listeners = new Set<AgentManagerListener>();
  private readonly completionPromises = new Map<string, Promise<AgentResult>>();
  private nextAgentSequence = 1;
  private isShuttingDown = false;

  constructor(options: AgentManagerOptions = {}) {
    this.createAgentRun = options.createAgentRun ?? startAgentRun;
    this.now = options.now ?? (() => Date.now());
    this.queue = new ConcurrencyQueue(options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
  }

  /** Starts one task and waits for the final result. */
  async run(task: AgentTask, options: AgentRunRequestOptions = {}): Promise<AgentResult> {
    const { resultPromise } = await this.start(task, options);
    return resultPromise;
  }

  /** Starts one task without waiting for completion and returns the agent id immediately. */
  async runInBackground(task: AgentTask, options: AgentRunRequestOptions = {}): Promise<string> {
    const { agentId } = await this.start({ ...task, mode: "background" }, options);
    return agentId;
  }

  /** Starts multiple tasks that share one higher-level request. */
  async runParallel(tasks: AgentTask[]): Promise<AgentResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  /** Stops one queued or running agent by agent id or child session id. Returns true when a matching run was found. */
  async stop(agentIdOrSessionId: string): Promise<boolean> {
    const agentId = this.resolveAgentId(agentIdOrSessionId);
    if (!agentId) {
      return false;
    }

    const queuedCancel = this.queuedCancels.get(agentId);
    if (queuedCancel?.()) {
      const record = this.agentRecords.get(agentId);
      if (record) {
        const completedAt = this.now();
        record.status = "cancelled";
        record.completedAt = completedAt;
        record.error = "Agent run was cancelled before start";
        this.emitChange();
      }
      this.queuedCancels.delete(agentId);
      return true;
    }

    const runningAgentState = this.runningAgentStates.get(agentId);
    if (!runningAgentState) {
      return false;
    }

    if (!runningAgentState.handle) {
      runningAgentState.stopRequested = true;
      return true;
    }

    await runningAgentState.handle.cancel();
    return true;
  }

  /** Shuts down the manager by cancelling queued and active work, then waiting for completion. */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    const activeAgentIds = this.list()
      .filter((record) => record.status === "queued" || record.status === "starting" || record.status === "running")
      .map((record) => record.id);

    await Promise.allSettled(activeAgentIds.map((agentId) => this.stop(agentId)));
    await Promise.allSettled(activeAgentIds.map((agentId) => this.completionPromises.get(agentId)).filter(Boolean));
  }

  /** Steers one running agent with a follow-up message. */
  async steer(agentId: string, message: string): Promise<void> {
    const runningAgentState = this.runningAgentStates.get(agentId);
    if (!runningAgentState?.handle) {
      throw new Error(`Agent is not running: ${agentId}`);
    }

    await runningAgentState.handle.steer(message);
  }

  /** Returns one tracked agent record, if present. */
  get(agentId: string): AgentRecord | undefined {
    const record = this.agentRecords.get(agentId);
    return record ? { ...record, usage: { ...record.usage } } : undefined;
  }

  /** Returns all tracked agent records in creation order. */
  list(): AgentRecord[] {
    return Array.from(this.agentRecords.values()).map((record) => ({
      ...record,
      usage: { ...record.usage },
    }));
  }

  /** Subscribes to snapshot updates for all tracked agent records. */
  subscribe(listener: AgentManagerListener): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Returns the structured `<subagent>` block payload for completed results. */
  collectResults(agentIds: string[]): string {
    const results: AgentResult[] = [];

    for (const agentId of agentIds) {
      const record = this.agentRecords.get(agentId);
      if (!record || (record.status !== "completed" && record.status !== "failed" && record.status !== "cancelled")) {
        continue;
      }

      results.push({
        agentId: record.id,
        agentName: record.agentName,
        sessionId: record.sessionId,
        sessionPath: record.sessionPath,
        status: record.status,
        responseText: record.responseText,
        error: record.error,
        usage: { ...record.usage },
      });
    }

    return formatResultCollectorOutput(results);
  }

  private resolveAgentId(agentIdOrSessionId: string): string | undefined {
    if (this.agentRecords.has(agentIdOrSessionId)) {
      return agentIdOrSessionId;
    }

    for (const record of this.agentRecords.values()) {
      if (record.sessionId === agentIdOrSessionId) {
        return record.id;
      }

      const liveSessionId = record.session?.sessionManager?.getSessionId?.();
      if (liveSessionId === agentIdOrSessionId) {
        return record.id;
      }
    }

    return undefined;
  }

  private async start(
    task: AgentTask,
    options: AgentRunRequestOptions,
  ): Promise<{ agentId: string; resultPromise: Promise<AgentResult> }> {
    if (this.isShuttingDown) {
      throw new Error(MANAGER_SHUTDOWN_ERROR);
    }

    if (!task.agentDefinition) {
      throw new Error(`Agent definition is required for task: ${task.agentName}`);
    }

    const agentDefinition = task.agentDefinition;
    const agentId = this.createAgentId();
    const record: AgentRecord = {
      id: agentId,
      agentName: task.agentName,
      prompt: task.prompt,
      status: "queued",
      mode: task.mode,
      createdAt: this.now(),
      usage: { ...emptyAgentUsageStats },
    };
    this.agentRecords.set(agentId, record);
    this.emitChange();

    const abortSignal = options.signal;
    const abortListener = () => {
      void this.stop(agentId);
    };
    abortSignal?.addEventListener("abort", abortListener, { once: true });

    const queuedTask = this.queue.enqueue(
      async () => {
        record.status = "starting";
        record.startedAt = this.now();
        this.emitChange();

        const runningAgentState: RunningAgentState = {
          stopRequested: abortSignal?.aborted ?? false,
        };
        this.runningAgentStates.set(agentId, runningAgentState);
        let unsubscribeSessionChanges: (() => void) | undefined;

        try {
          const runningHandle = await this.createAgentRun({
            agentId,
            agentName: task.agentName,
            prompt: task.prompt,
            cwd: task.cwd,
            mode: task.mode,
            parentSession: task.parentSession,
            parentSessionWriter: task.parentSessionWriter,
            childSessionDescriptor: task.childSessionDescriptor,
            tools: task.tools,
            model: task.model,
            thinking: task.thinking,
            maxTurns: task.maxTurns,
            timeoutMs: task.timeoutMs,
            agentDefinition,
          });
          record.session = runningHandle.session;
          record.sessionId = runningHandle.sessionId;
          record.sessionPath = runningHandle.sessionPath ?? record.sessionPath;
          runningAgentState.handle = runningHandle;
          unsubscribeSessionChanges = runningHandle.session.subscribe(() => this.emitChange());
          record.status = "running";
          this.emitChange();
          if (runningAgentState.stopRequested) {
            await runningHandle.cancel();
          }

          const result = await runningHandle.completion;
          this.applyResult(record, result);
          return result;
        } catch (error) {
          const failedResult: AgentResult = {
            agentId,
            agentName: task.agentName,
            status: "failed",
            error: getAgentRunErrorMessage(error),
            usage: { ...emptyAgentUsageStats },
          };
          this.applyResult(record, failedResult);
          return failedResult;
        } finally {
          unsubscribeSessionChanges?.();
          this.runningAgentStates.delete(agentId);
          this.queuedCancels.delete(agentId);
          abortSignal?.removeEventListener("abort", abortListener);
        }
      },
      { workspaceAccess: task.workspaceAccess },
    );

    this.queuedCancels.set(agentId, queuedTask.cancel);
    const resultPromise = queuedTask.promise.catch((error: unknown) => {
      if (error instanceof QueuedTaskCancelledError) {
        const cancelledResult: AgentResult = {
          agentId,
          agentName: task.agentName,
          status: "cancelled",
          error: "Agent run was cancelled before start",
          usage: { ...emptyAgentUsageStats },
        };
        this.applyResult(record, cancelledResult);
        return cancelledResult;
      }

      throw error;
    });
    this.completionPromises.set(
      agentId,
      resultPromise.finally(() => this.completionPromises.delete(agentId)),
    );

    return { agentId, resultPromise };
  }

  private applyResult(record: AgentRecord, result: AgentResult): void {
    record.status = result.status;
    record.completedAt = this.now();
    record.sessionId = result.sessionId;
    record.sessionPath = result.sessionPath;
    record.responseText = result.responseText;
    record.error = result.error;
    record.usage = { ...result.usage };
    this.emitChange();
  }

  private emitChange(): void {
    const records = this.list();
    for (const listener of this.listeners) {
      listener(records);
    }
  }

  private createAgentId(): string {
    const sequence = this.nextAgentSequence;
    this.nextAgentSequence += 1;
    return `${AGENT_ID_PREFIX}-${this.now().toString(36)}-${sequence.toString(36)}`;
  }
}

function getAgentRunErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Agent run failed";
}
