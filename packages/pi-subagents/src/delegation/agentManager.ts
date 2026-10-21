import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { type AgentRunHandle, type StartAgentRunOptions, startDelegatedRun } from "./agentRunner";
import { ConcurrencyQueue, QueuedTaskCancelledError } from "./concurrencyQueue";
import { formatResultCollectorOutput } from "./resultCollector";
import type {
  AgentCancellationOrigin,
  AgentObservation,
  AgentParentCorrelation,
  AgentRecord,
  AgentResult,
  AgentTask,
  AgentTerminalEvent,
} from "./types";
import { AgentCancellation, emptyAgentUsageStats, invokeAgentObserver } from "./types";

const DEFAULT_MAX_CONCURRENCY = 4;
const AGENT_ID_PREFIX = "agent";
const MANAGER_SHUTDOWN_ERROR = "Agent manager is shut down";
/**
 * Upper bound for shutdown's wait on run teardown. Runs normally settle within
 * the interrupt settle bound; this only guards against unforeseen hangs so
 * session_shutdown can never block indefinitely.
 */
const SHUTDOWN_SETTLE_TIMEOUT_MS = 10_000;
const ASSEMBLY_CANCEL_SETTLE_TIMEOUT_MS = 2_000;

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
  parent?: Readonly<AgentParentCorrelation>;
  onAdmitted?: (agentId: string) => void;
}

interface RunningAgentState {
  handle?: AgentRunHandle;
  cancellation: AgentCancellation;
  cancelPromise?: Promise<void>;
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
  private readonly terminalListeners = new Set<(event: AgentTerminalEvent) => void>();
  private readonly parents = new Map<string, Readonly<AgentParentCorrelation>>();
  private nextAgentSequence = 1;
  private isShuttingDown = false;

  constructor(options: AgentManagerOptions = {}) {
    this.createAgentRun = options.createAgentRun ?? startDelegatedRun;
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
  async stop(agentIdOrSessionId: string, origin: AgentCancellationOrigin = "caller"): Promise<boolean> {
    const agentId = this.resolveAgentId(agentIdOrSessionId);
    const state = agentId ? this.runningAgentStates.get(agentId) : undefined;
    if (!agentId || !state || this.agentRecords.get(agentId)?.completedAt !== undefined) return false;
    state.cancellation.request(origin);
    this.queuedCancels.get(agentId)?.();
    if (state.handle) await cancelRun(state, state.handle);
    return true;
  }

  /** Closes admission and signals every admitted run synchronously before waiting. */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const active = [...this.runningAgentStates.entries()];
    for (const [, state] of active) state.cancellation.request("shutdown");
    const stops = active.map(([id, state]) => {
      this.queuedCancels.get(id)?.();
      return state.handle ? cancelRun(state, state.handle) : undefined;
    });
    const bound = cancellableDelay(SHUTDOWN_SETTLE_TIMEOUT_MS);
    try {
      await Promise.race([Promise.allSettled([...stops, ...this.completionPromises.values()]), bound.promise]);
    } finally {
      bound.cancel();
    }
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
    invokeAgentObserver(() => listener(this.list()));
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Subscribes to future terminal transitions; listener failures are reported and isolated. */
  subscribeTerminal(listener: (event: AgentTerminalEvent) => void): () => void {
    this.terminalListeners.add(listener);
    return () => {
      this.terminalListeners.delete(listener);
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
    const cancellation = new AgentCancellation();
    const runningAgentState: RunningAgentState = { cancellation };
    this.runningAgentStates.set(agentId, runningAgentState);
    this.agentRecords.set(agentId, record);
    const parent = options.parent ?? task.parent;
    if (parent) this.parents.set(agentId, Object.freeze({ ...parent }));
    invokeAgentObserver(() => options.onAdmitted?.(agentId));
    this.emitChange();

    const abortSignal = options.signal;
    const abortListener = () => {
      // fire-and-forget: caller abort signals cancellation synchronously.
      void this.stop(agentId, "caller").catch((error) => console.warn("[pi-subagents] cancel failed", error));
    };
    abortSignal?.addEventListener("abort", abortListener, { once: true });
    if (abortSignal?.aborted) cancellation.request("caller");

    const queuedTask = this.queue.enqueue(
      async () => {
        record.status = "starting";
        record.startedAt = this.now();
        this.emitChange();

        let unsubscribeSessionChanges: (() => void) | undefined;

        try {
          if (cancellation.signal.aborted) throw new QueuedTaskCancelledError();
          let cancelAssembly!: () => void;
          let assemblyCancelTimer: ReturnType<typeof setTimeout> | undefined;
          const cancelled = new Promise<never>((_resolve, reject) => {
            // The runner may already be prompting before its async handle reaches us.
            // Allow the same interrupt grace as a running turn before freeing the slot.
            cancelAssembly = () => {
              assemblyCancelTimer = setTimeout(
                () => reject(new QueuedTaskCancelledError()),
                ASSEMBLY_CANCEL_SETTLE_TIMEOUT_MS,
              );
            };
            cancellation.signal.addEventListener("abort", cancelAssembly, { once: true });
          });
          let assembly: Promise<AgentRunHandle>;
          try {
            assembly = this.createAgentRun({
              cancellation,
              agentId,
              agentName: task.agentName,
              prompt: task.prompt,
              cwd: task.cwd,
              mode: task.mode,
              systemPrompt: task.systemPrompt,
              parentSessionPath: task.parentSessionPath,
              resolveExtensions: task.resolveExtensions,
              onSessionCreated: task.onSessionCreated,
              onStarted: task.onStarted,
              onCompleted: task.onCompleted,
              tools: task.tools,
              model: task.model,
              parentModel: task.parentModel,
              parentThinking: task.parentThinking,
              thinking: task.thinking,
              maxTurns: task.maxTurns,
              timeoutMs: task.timeoutMs,
            });
          } catch (error) {
            assembly = Promise.reject(error);
          }
          // fire-and-forget: late assembly must be interrupted even after manager settlement.
          void assembly
            .then((handle) => {
              if (cancellation.signal.aborted) return cancelRun(runningAgentState, handle);
            })
            .catch((error) => console.warn("[pi-subagents] late assembly cleanup failed", error));
          let runningHandle: AgentRunHandle;
          try {
            runningHandle = await Promise.race([assembly, cancelled]);
          } finally {
            cancellation.signal.removeEventListener("abort", cancelAssembly);
            if (assemblyCancelTimer !== undefined) clearTimeout(assemblyCancelTimer);
          }
          record.session = createLiveObservation(runningHandle.session);
          record.sessionId = runningHandle.sessionId;
          record.sessionPath = runningHandle.sessionPath ?? record.sessionPath;
          runningAgentState.handle = runningHandle;
          unsubscribeSessionChanges = runningHandle.session.subscribe(() => this.emitChange());
          record.status = "running";
          this.emitChange();
          if (cancellation.signal.aborted) await cancelRun(runningAgentState, runningHandle);
          const completed = await runningHandle.completion;
          const result = cancellation.origin ? interruptedResult(record, cancellation, completed) : completed;
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
          const result = cancellation.origin ? interruptedResult(record, cancellation) : failedResult;
          this.applyResult(record, result);
          return result;
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
    if (cancellation.signal.aborted) queuedTask.cancel();
    const resultPromise = queuedTask.promise.catch((error: unknown) => {
      if (error instanceof QueuedTaskCancelledError) {
        const cancelledResult: AgentResult = {
          agentId,
          agentName: task.agentName,
          status: "cancelled",
          error: "Agent run was cancelled before start",
          usage: { ...emptyAgentUsageStats },
        };
        const result = { ...cancelledResult, cancellationOrigin: cancellation.origin };
        this.applyResult(record, result);
        this.runningAgentStates.delete(agentId);
        this.queuedCancels.delete(agentId);
        abortSignal?.removeEventListener("abort", abortListener);
        return result;
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
    if (record.completedAt !== undefined) return;
    record.status = result.status;
    record.completedAt = this.now();
    record.sessionId = result.sessionId;
    record.sessionPath = result.sessionPath;
    record.responseText = result.responseText;
    record.error = result.error;
    record.usage = { ...result.usage };
    record.cancellationOrigin = result.cancellationOrigin;
    this.emitChange();
    const event: AgentTerminalEvent = {
      record: { ...record, usage: { ...record.usage } },
      result,
      parent: this.parents.get(record.id),
    };
    this.parents.delete(record.id);
    for (const listener of this.terminalListeners) invokeAgentObserver(() => listener(event));
  }

  private emitChange(): void {
    const records = this.list();
    for (const listener of this.listeners) {
      invokeAgentObserver(() => listener(records));
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

/** A delay whose timer can be cleared once its race is no longer needed. */
function cancellableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/** Build a stable, getter-only view; every read uses the latest SDK state. */
function createLiveObservation(session: AgentSession): AgentObservation {
  return Object.freeze({
    get messages() {
      return session.messages;
    },
    get model() {
      return session.model;
    },
    get thinkingLevel() {
      return session.thinkingLevel;
    },
  });
}

function interruptedResult(record: AgentRecord, cancellation: AgentCancellation, result?: AgentResult): AgentResult {
  const origin = cancellation.origin;
  const limited = origin === "timeout" || origin === "maxTurns";
  return {
    ...result,
    agentId: record.id,
    agentName: record.agentName,
    usage: result?.usage ?? { ...emptyAgentUsageStats },
    status: limited ? "failed" : "cancelled",
    error: result?.cancellationOrigin
      ? result.error
      : limited
        ? `Agent run interrupted: ${origin}`
        : "Agent run was cancelled",
    cancellationOrigin: origin,
  };
}

function cancelRun(state: RunningAgentState, handle: AgentRunHandle): Promise<void> {
  state.cancelPromise ??= handle.cancel();
  return state.cancelPromise;
}
