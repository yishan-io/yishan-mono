import { app } from "@/app";
import { handleCleanup } from "@/scheduled/cleanup";

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Parameters<typeof handleCleanup>[0], ctx: ExecutionContext) {
    ctx.waitUntil(handleCleanup(env));
  },
};
