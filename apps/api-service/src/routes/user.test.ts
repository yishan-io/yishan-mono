import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/hono";
import { handleAppError } from "@/middlewares/error";
import { userRouter } from "@/routes/user";

describe("userRouter personal Local Task key allocation", () => {
  const allocatePersonalLocalTaskKey = vi.fn();
  let app: Hono<AppEnv>;

  beforeEach(() => {
    allocatePersonalLocalTaskKey.mockReset();
    app = new Hono<AppEnv>();
    app.onError(handleAppError);
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", { user: { allocatePersonalLocalTaskKey } } as never);
      await next();
    });
    app.route("/", userRouter);
  });

  it("allocates a personal key from the authenticated user identity", async () => {
    allocatePersonalLocalTaskKey.mockResolvedValue({ key: "PERS-1" });

    const response = await app.fetch(
      new Request("http://localhost/me/local-tasks/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localTaskId: "task-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ key: "PERS-1" });
    expect(allocatePersonalLocalTaskKey).toHaveBeenCalledWith({ actorUserId: "user-1", localTaskId: "task-1" });
  });
});
