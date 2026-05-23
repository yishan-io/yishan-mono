import { z } from "zod";

import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";

export const voiceTranscriptionParamsSchema = orgIdParamSchema;

export const voiceTranscriptionBodySchema = z.object({
  audioData: nonEmptyStringSchema,
  audioFormat: z.enum(["webm", "wav", "mp4", "ogg", "m4a"]),
  durationSeconds: z.coerce.number().int().positive().max(60),
  prompt: nonEmptyStringSchema.optional(),
});

export type VoiceTranscriptionParamsInput = z.infer<typeof voiceTranscriptionParamsSchema>;
export type VoiceTranscriptionBodyInput = z.infer<typeof voiceTranscriptionBodySchema>;
