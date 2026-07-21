import { SUPPORTED_LANGUAGE_CODES } from "@/lib/user-preferences";
import { z } from "zod";

const notificationEventTypeSchema = z.enum(["run-finished", "run-failed", "pending-question"]);
const notificationSoundIdSchema = z.enum(["chime", "ping", "pop", "zip", "alert"]);

const notificationEventSoundsSchema = z.object({
  "run-finished": notificationSoundIdSchema,
  "run-failed": notificationSoundIdSchema,
  "pending-question": notificationSoundIdSchema,
});

export const notificationPreferencesSchema = z.object({
  schemaVersion: z.number().int().positive(),
  enabled: z.boolean(),
  osEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  volume: z.number().min(0).max(1),
  focusOnClick: z.boolean(),
  enabledEventTypes: z.array(notificationEventTypeSchema),
  eventSounds: notificationEventSoundsSchema,
});

export const updateNotificationPreferencesBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    schemaVersion: z.number().int().positive().optional(),
    osEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
    focusOnClick: z.boolean().optional(),
    enabledEventTypes: z.array(notificationEventTypeSchema).optional(),
    eventSounds: notificationEventSoundsSchema.partial().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateNotificationPreferencesBodyInput = z.infer<typeof updateNotificationPreferencesBodySchema>;

export const updateLanguagePreferenceBodySchema = z.object({
  languagePreference: z.enum(SUPPORTED_LANGUAGE_CODES),
});

export type UpdateLanguagePreferenceBodyInput = z.infer<typeof updateLanguagePreferenceBodySchema>;
