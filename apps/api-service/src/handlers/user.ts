import type { AppContext } from "@/hono";

export async function meHandler(c: AppContext) {
  const user = c.get("sessionUser");
  return c.json({ user });
}
