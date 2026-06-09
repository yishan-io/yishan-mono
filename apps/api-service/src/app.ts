import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";

import type { AppEnv } from "@/hono";
import { requireAuthUser } from "@/middlewares/auth";
import { injectRequestContext } from "@/middlewares/context";
import { corsMiddleware } from "@/middlewares/cors";
import { handleAppError } from "@/middlewares/error";
import { authRouter } from "@/routes/auth";
import { nodeRouter } from "@/routes/node";
import { organizationRouter } from "@/routes/organization";
import { overviewRouter } from "@/routes/overview";
import { projectRouter } from "@/routes/project";
import { serviceTokenRouter } from "@/routes/service-token";
import { systemRouter } from "@/routes/system";
import { tokenUsageRouter } from "@/routes/token-usage";
import { userRouter } from "@/routes/user";
import { voiceTranscriptionRouter } from "@/routes/voice-transcription";

export const app = new Hono<AppEnv>();
const protectedRouter = new Hono<AppEnv>();

app.use("/*", corsMiddleware);
app.route("/", systemRouter);
app.use("/*", injectRequestContext);
app.onError(handleAppError);
app.notFound((c) => c.json({ error: "Not Found" }, StatusCodes.NOT_FOUND));

app.route("/auth", authRouter);

protectedRouter.use("/*", requireAuthUser);
protectedRouter.route("/", userRouter);
protectedRouter.route("/", organizationRouter);
protectedRouter.route("/", nodeRouter);
protectedRouter.route("/", projectRouter);
protectedRouter.route("/", serviceTokenRouter);
protectedRouter.route("/", tokenUsageRouter);
protectedRouter.route("/", overviewRouter);
protectedRouter.route("/", voiceTranscriptionRouter);

app.route("/", protectedRouter);
