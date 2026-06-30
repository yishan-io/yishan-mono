import { app } from "@/app";
import { websocket } from "hono/bun";

const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  idleTimeout: 120,
  port,
  fetch(request, server) {
    return app.fetch(request, server);
  },
  websocket,
});

console.log(`API service listening on ${port}`);
