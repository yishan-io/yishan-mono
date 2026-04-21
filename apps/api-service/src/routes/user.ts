import { Hono } from "hono";

import { meHandler } from "@/handlers/user";
import type { AppEnv } from "@/hono";

export const userRouter = new Hono<AppEnv>();

userRouter.get("/me", meHandler);
