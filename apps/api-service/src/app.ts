import { Hono } from "hono";

import type { AppEnv } from "./hono";
import { corsMiddleware } from "./middlewares/cors";
import { authRouter } from "./routes/auth";
import { systemRouter } from "./routes/system";
import { userRouter } from "./routes/user";

export const app = new Hono<AppEnv>();

app.use("/*", corsMiddleware);

app.route("/", systemRouter);
app.route("/auth", authRouter);
app.route("/", userRouter);
