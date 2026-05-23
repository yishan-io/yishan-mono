import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { voiceTranscribeHandler } from "@/handlers/voice-transcription";
import type { AppEnv } from "@/hono";
import { requireOrganizationMemberFromParam } from "@/middlewares/organization-access";
import { validationErrorResponse } from "@/validation/error-response";
import { voiceTranscriptionBodySchema, voiceTranscriptionParamsSchema } from "@/validation/voice-transcription";

export const voiceTranscriptionRouter = new Hono<AppEnv>();

voiceTranscriptionRouter.post(
  "/orgs/:orgId/voice-transcribe",
  zValidator("param", voiceTranscriptionParamsSchema, validationErrorResponse),
  requireOrganizationMemberFromParam,
  zValidator("json", voiceTranscriptionBodySchema, validationErrorResponse),
  (c) => voiceTranscribeHandler(c, c.req.valid("param"), c.req.valid("json")),
);
