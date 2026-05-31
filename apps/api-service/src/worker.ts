import { app } from "@/app";
import type { CleanupEnv } from "@/scheduled/cleanup";
import { handleCleanup } from "@/scheduled/cleanup";
import { handleDispatchMessage, type RelayDispatchEnv } from "@/scheduled/consumer";
import { type ScheduledDbEnv, runWithScheduledDb } from "@/scheduled/db";
import type { EvaluatorEnv } from "@/scheduled/evaluator";
import { handleEvaluateJobs } from "@/scheduled/evaluator";
import type { DispatchMessage, QueueEnv } from "@/scheduled/queue";
import { JobEvaluatorService } from "@/services/job-evaluator-service";

type WorkerEnv = ScheduledDbEnv & CleanupEnv & EvaluatorEnv & RelayDispatchEnv & QueueEnv;

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(
        runWithScheduledDb(env, "evaluator", async (db) => {
          const jobEvaluatorService = new JobEvaluatorService(db);
          await handleEvaluateJobs(jobEvaluatorService, env);
        }),
      );
    } else {
      ctx.waitUntil(
        runWithScheduledDb(env, "cleanup", async (db) => {
          await handleCleanup(db, env);
        }),
      );
    }
  },
  async queue(batch: MessageBatch<DispatchMessage>, env: WorkerEnv, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      ctx.waitUntil(
        runWithScheduledDb(env, "queue-consumer", async (db) => {
          const jobEvaluatorService = new JobEvaluatorService(db);
          await handleDispatchMessage(jobEvaluatorService, env, message.body);
          return true;
        })
          .then((result) => {
            if (result !== true) {
              throw new Error("queue-consumer database is not available");
            }
            message.ack();
          })
          .catch((error) => {
            console.error("[queue-consumer] Failed to process message", {
              runId: message.body.runId,
              error,
            });
            message.retry();
          }),
      );
    }
  },
};
