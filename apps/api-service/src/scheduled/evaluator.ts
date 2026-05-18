import type { ScheduledDbEnv } from "@/scheduled/db";
import { type DispatchMessage, type QStashEnv, publishViaQStash } from "@/scheduled/qstash";
import type { JobEvaluatorService } from "@/services/job-evaluator-service";

const EVALUATE_LIMIT = 500;
const STALE_THRESHOLD_MINUTES = 5;

export type EvaluatorEnv = ScheduledDbEnv & QStashEnv;

export async function handleEvaluateJobs(jobEvaluatorService: JobEvaluatorService, env: EvaluatorEnv): Promise<void> {
  try {
    const pendingRuns = await jobEvaluatorService.evaluateDueJobs({ limit: EVALUATE_LIMIT });

    if (pendingRuns.length === 0) {
      return;
    }

    const messages: DispatchMessage[] = pendingRuns.map((run) => ({
      runId: run.runId,
      nodeId: run.job.nodeId,
      jobId: run.job.id,
      agentKind: run.job.agentKind,
      prompt: run.job.prompt,
      model: run.job.model ?? "",
      command: run.job.command ?? "",
      scheduledFor: run.scheduledFor.toISOString(),
    }));

    const published = await publishViaQStash(env, messages);

    console.log(`[evaluator] Evaluated ${pendingRuns.length} due jobs, dispatched ${published} via QStash`);

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
