import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { meHandler, updateLanguagePreferenceHandler, updateNotificationPreferencesHandler } from "@/handlers/user";
import type { AppEnv } from "@/hono";
import { validationErrorResponse } from "@/validation/error-response";
import { updateLanguagePreferenceBodySchema, updateNotificationPreferencesBodySchema } from "@/validation/user";

export const userRouter = new Hono<AppEnv>();

userRouter.get("/me", meHandler);
userRouter.put(
  "/language-preference",
  zValidator("json", updateLanguagePreferenceBodySchema, validationErrorResponse),
  (c) => updateLanguagePreferenceHandler(c, c.req.valid("json")),
);
userRouter.put(
  "/notification-preferences",
  zValidator("json", updateNotificationPreferencesBodySchema, validationErrorResponse),
  (c) => updateNotificationPreferencesHandler(c, c.req.valid("json")),
);
