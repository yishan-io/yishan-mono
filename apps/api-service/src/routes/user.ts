import { Hono } from "hono";

import { meHandler } from "../handlers/user";
import type { AppEnv } from "../hono";
import { requireSessionUser } from "../middlewares/session";

export const userRouter = new Hono<AppEnv>();

userRouter.get("/me", requireSessionUser, meHandler);
