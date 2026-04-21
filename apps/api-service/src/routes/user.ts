import { Hono } from "hono";

import { meHandler } from "../handlers/user";
import type { AppEnv } from "../hono";
import { requireAuthUser } from "../middlewares/auth";

export const userRouter = new Hono<AppEnv>();

userRouter.get("/me", requireAuthUser, meHandler);
