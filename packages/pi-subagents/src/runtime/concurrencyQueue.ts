/** Options for scheduling one queued agent run. */
export interface QueueTaskOptions {
  readOnly: boolean;
}

/** Handle returned when scheduling one queued task. */
export interface QueuedTaskHandle<T> {
  promise: Promise<T>;
  cancel(): boolean;
}

interface QueueTask<T> {
  options: QueueTaskOptions;
  run: () => Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  isCancelled: boolean;
  hasStarted: boolean;
}

/** Error used when one queued task is cancelled before it starts. */
export class QueuedTaskCancelledError extends Error {
  constructor() {
    super("Queued task was cancelled");
    this.name = "QueuedTaskCancelledError";
  }
}

/**
 * Concurrency limiter that allows up to N read-only runs or exactly one write run.
 */
export class ConcurrencyQueue {
  private readonly pendingTasks: Array<QueueTask<unknown>> = [];
  private activeTaskCount = 0;
  private hasActiveWriteTask = false;

  constructor(private readonly maxConcurrency: number) {}

  /** Schedules one task and returns a promise plus a queued-task cancel handle. */
  enqueue<T>(run: () => Promise<T>, options: QueueTaskOptions): QueuedTaskHandle<T> {
    let queueTask: QueueTask<T> | undefined;
    const promise = new Promise<T>((resolve, reject) => {
      queueTask = {
        options,
        run,
        resolve,
        reject,
        isCancelled: false,
        hasStarted: false,
      };
    });

    if (!queueTask) {
      throw new Error("Failed to initialize queue task");
    }

    this.pendingTasks.push(queueTask as QueueTask<unknown>);
    this.drain();

    return {
      promise,
      cancel: () => this.cancelTask(queueTask as QueueTask<unknown>),
    };
  }

  private cancelTask(task: QueueTask<unknown>): boolean {
    if (task.hasStarted || task.isCancelled) {
      return false;
    }

    task.isCancelled = true;
    const taskIndex = this.pendingTasks.indexOf(task);
    if (taskIndex >= 0) {
      this.pendingTasks.splice(taskIndex, 1);
    }
    task.reject(new QueuedTaskCancelledError());
    return true;
  }

  private drain(): void {
    while (this.pendingTasks.length > 0) {
      const nextTaskIndex = this.pendingTasks.findIndex((task) => this.canStartTask(task));
      if (nextTaskIndex < 0) {
        return;
      }

      const [nextTask] = this.pendingTasks.splice(nextTaskIndex, 1);
      if (!nextTask || nextTask.isCancelled) {
        continue;
      }

      nextTask.hasStarted = true;
      this.activeTaskCount += 1;
      if (!nextTask.options.readOnly) {
        this.hasActiveWriteTask = true;
      }

      void this.runTask(nextTask);
    }
  }

  private canStartTask(task: QueueTask<unknown>): boolean {
    if (!task.options.readOnly) {
      return this.activeTaskCount === 0;
    }

    return !this.hasActiveWriteTask && this.activeTaskCount < this.maxConcurrency;
  }

  private async runTask(task: QueueTask<unknown>): Promise<void> {
    try {
      const result = await task.run();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeTaskCount -= 1;
      if (!task.options.readOnly) {
        this.hasActiveWriteTask = false;
      }
      this.drain();
    }
  }
}
