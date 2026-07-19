import type { AgentRecord, AgentResult, AgentTask } from "../agents/types";
import { emptyAgentUsageStats } from "../agents/types";
import { type AgentRunHandle, type StartAgentRunOptions, startAgentRun } from "./agentRunner";
import { ConcurrencyQueue, QueuedTaskCancelledError } from "./concurrencyQueue";
import { formatResultCollectorOutput } from "./resultCollector";

const DEFAULT_MAX_CONCURRENCY = 16;
const AGENT_ID_PREFIX = "agent";

/** Configurable dependencies for the shared agent manager. */
export interface AgentManagerOptions {
  maxConcurrency?: number;
  now?: () => number;
  createAgentRun?: (options: StartAgentRunOptions) => Promise<AgentRunHandle>;
}

/** Snapshot listener notified whenever tracked agent state changes. */
export type AgentManagerListener = (records: AgentRecord[]) => void;

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
  private nextAgentSequence = 1;

  constructor(options: AgentManagerOptions = {}) {
    this.createAgentRun = options.createAgentRun ?? startAgentRun;
    this.now = options.now ?? (() => Date.now());
    this.queue = new ConcurrencyQueue(options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
  }

  /** Starts one task and waits for the final result. */
  async run(task: AgentTask): Promise<AgentResult> {
    const { resultPromise } = await this.start(task);
    return resultPromise;
  }

  /** Starts one task without waiting for completion and returns the agent id immediately. */
  async runInBackground(task: AgentTask): Promise<string> {
    const { agentId } = await this.start({ ...task, mode: "background" });
    return agentId;
  }

  /** Starts multiple tasks that share one higher-level request. */
  async runParallel(tasks: AgentTask[]): Promise<AgentResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  /** Stops one queued or running agent. */
  async stop(agentId: string): Promise<void> {
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
      return;
    }

    const runningAgentState = this.runningAgentStates.get(agentId);
    if (!runningAgentState) {
      return;
    }

    if (!runningAgentState.handle) {
      runningAgentState.stopRequested = true;
      return;
    }

    await runningAgentState.handle.cancel();
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

  private async start(task: AgentTask): Promise<{ agentId: string; resultPromise: Promise<AgentResult> }> {
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

    const queuedTask = this.queue.enqueue(
      async () => {
        record.status = "running";
        record.startedAt = this.now();
        this.emitChange();

        const runningAgentState: RunningAgentState = {
          stopRequested: false,
        };
        this.runningAgentStates.set(agentId, runningAgentState);

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
          runningAgentState.handle = runningHandle;
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
          this.runningAgentStates.delete(agentId);
          this.queuedCancels.delete(agentId);
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
