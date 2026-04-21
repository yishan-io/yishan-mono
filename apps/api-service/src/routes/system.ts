import { Hono } from "hono";

import { healthHandler } from "../handlers/health";
import type { AppEnv } from "../hono";

export const systemRouter = new Hono<AppEnv>();

systemRouter.get("/health", healthHandler);
