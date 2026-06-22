import { app } from "@/app";
import { websocket } from "hono/bun";

const DEFAULT_HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? DEFAULT_HOST;
const listenLabel = host === "0.0.0.0" ? "all interfaces" : host;

Bun.serve({
  hostname: host,
  idleTimeout: 120,
  port,
  fetch(request, server) {
    return app.fetch(request, server);
  },
  websocket,
});

console.log(`API service listening on ${listenLabel}:${port}`);
