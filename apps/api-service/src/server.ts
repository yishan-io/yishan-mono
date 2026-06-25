import { app } from "@/app";

const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  port,
  fetch(request) {
    return app.fetch(request);
  },
});

console.log(`API service listening on http://localhost:${port}`);
