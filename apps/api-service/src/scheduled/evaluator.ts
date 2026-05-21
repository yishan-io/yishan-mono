import type { ScheduledDbEnv } from "@/scheduled/db";
import { type DispatchMessage, type QueueEnv, publishViaQueue } from "@/scheduled/queue";
import type { JobEvaluatorService } from "@/services/job-evaluator-service";

const EVALUATE_LIMIT = 500;
const STALE_THRESHOLD_MINUTES = 5;

/**
 * Hard deadline for a single evaluator run, in milliseconds (50 seconds).
 *
 * The cron fires every 60 s. Setting the deadline to 50 s ensures the evaluator
 * finishes before the next tick, preventing overlapping evaluations when the DB
 * or queue publishing is temporarily slow.
 */
const EVALUATOR_TIMEOUT_MS = 50_000;

export type EvaluatorEnv = ScheduledDbEnv & QueueEnv;

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`[evaluator] Timed out after ${ms}ms`)), ms),
  );
}

export async function handleEvaluateJobs(jobEvaluatorService: JobEvaluatorService, env: EvaluatorEnv): Promise<void> {
  await Promise.race([runEvaluator(jobEvaluatorService, env), timeoutAfter(EVALUATOR_TIMEOUT_MS)]);
}

async function runEvaluator(jobEvaluatorService: JobEvaluatorService, env: EvaluatorEnv): Promise<void> {
  try {
    const pendingRuns = await jobEvaluatorService.evaluateDueJobs({ limit: EVALUATE_LIMIT });

    if (pendingRuns.length === 0) {
      return;
    }

    const messages: DispatchMessage[] = pendingRuns.map((run) => ({
      runId: run.runId,
      nodeId: run.job.nodeId,
      jobId: run.job.id,
      projectId: run.job.projectId,
      agentKind: run.job.agentKind,
      prompt: run.job.prompt,
      model: run.job.model ?? "",
      command: run.job.command ?? "",
      scheduledFor: run.scheduledFor.toISOString(),
    }));

    const published = await publishViaQueue(env, messages);

    console.log(`[evaluator] Evaluated ${pendingRuns.length} due jobs, dispatched ${published} via Cloudflare Queue`);

    const staleCount = await jobEvaluatorService.markStaleRunsOffline({
      staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
    });

    if (staleCount > 0) {
      console.log(`[evaluator] Marked ${staleCount} stale runs as skipped_offline`);
    }
  } catch (error) {
    console.error("[evaluator] Failed:", error);
    throw error;
  }
}
