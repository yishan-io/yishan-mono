import { app } from "@/app";
import type { CleanupEnv } from "@/scheduled/cleanup";
import { handleCleanup } from "@/scheduled/cleanup";
import { type ScheduledDbEnv, runWithScheduledDb } from "@/scheduled/db";
import type { EvaluatorEnv } from "@/scheduled/evaluator";
import { handleEvaluateJobs } from "@/scheduled/evaluator";
import { JobEvaluatorService } from "@/services/job-evaluator-service";

type WorkerEnv = ScheduledDbEnv & CleanupEnv & EvaluatorEnv;

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    if (event.cron === "* * * * *") {
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
};
