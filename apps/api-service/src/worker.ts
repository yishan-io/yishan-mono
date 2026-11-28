import { app } from "@/app";
import type { CleanupEnv } from "@/scheduled/cleanup";
import { handleCleanup } from "@/scheduled/cleanup";
import { type ScheduledDbEnv, runWithScheduledDb } from "@/scheduled/db";

type WorkerEnv = ScheduledDbEnv & CleanupEnv;

const DAILY_CLEANUP_CRON = "0 3 * * *";

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    if (event.cron === DAILY_CLEANUP_CRON) {
      ctx.waitUntil(
        runWithScheduledDb(env, "cleanup", async (db) => {
          await handleCleanup(db, env);
        }),
      );
    }
  },
};
