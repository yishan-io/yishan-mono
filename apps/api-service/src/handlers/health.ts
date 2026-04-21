import type { AppContext } from "../hono";

export function healthHandler(c: AppContext) {
  return c.json({ ok: true });
}
