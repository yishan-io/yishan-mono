import type { notificationPreferencesSchema } from "@/validation/user";
import type { z } from "zod";

export const SUPPORTED_NOTIFICATION_EVENT_TYPES = ["run-finished", "run-failed", "pending-question"] as const;
export type NotificationEventType = (typeof SUPPORTED_NOTIFICATION_EVENT_TYPES)[number];

export const SUPPORTED_NOTIFICATION_SOUND_IDS = ["chime", "ping", "pop", "zip", "alert"] as const;
export type NotificationSoundId = (typeof SUPPORTED_NOTIFICATION_SOUND_IDS)[number];

export const SUPPORTED_NOTIFICATION_CATEGORIES = ["ai-task"] as const;
export type NotificationCategory = (typeof SUPPORTED_NOTIFICATION_CATEGORIES)[number];
export const CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION = 2;

/** Canonical type derived from the validation schema — the two stay in sync automatically. */
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export type NotificationPreferencesPatch = Partial<
  Omit<NotificationPreferences, "eventSounds"> & {
    eventSounds: Partial<Record<NotificationEventType, NotificationSoundId>>;
  }
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  schemaVersion: CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  enabled: true,
  osEnabled: true,
  soundEnabled: true,
  volume: 1,
  focusOnClick: true,
  enabledEventTypes: [...SUPPORTED_NOTIFICATION_EVENT_TYPES],
  eventSounds: {
    "run-finished": "chime",
    "run-failed": "alert",
    "pending-question": "ping",
  },
  enabledCategories: [...SUPPORTED_NOTIFICATION_CATEGORIES],
};

/** Normalizes one stored preferences payload into one full runtime-safe snapshot. */
export function normalizeNotificationPreferences(
  stored: unknown,
  fallback: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): NotificationPreferences {
  const candidate = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};

  const enabledEventTypes = [...new Set(
    [
      ...(Array.isArray(candidate.enabledEventTypes) ? candidate.enabledEventTypes : fallback.enabledEventTypes),
      ...fallback.enabledEventTypes,
    ].filter(isNotificationEventType),
  )];
  const enabledCategories = [...new Set(
    (Array.isArray(candidate.enabledCategories) ? candidate.enabledCategories : fallback.enabledCategories).filter(
      isNotificationCategory,
    ),
  )];

  const eventSoundsCandidate =
    candidate.eventSounds && typeof candidate.eventSounds === "object"
      ? (candidate.eventSounds as Record<string, unknown>)
      : {};
  const eventSounds = SUPPORTED_NOTIFICATION_EVENT_TYPES.reduce<NotificationPreferences["eventSounds"]>(
    (accumulator, eventType) => {
      const value = eventSoundsCandidate[eventType];
      accumulator[eventType] = isNotificationSoundId(value) ? value : fallback.eventSounds[eventType];
      return accumulator;
    },
    { ...fallback.eventSounds },
  );

  return {
    schemaVersion: CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    osEnabled: typeof candidate.osEnabled === "boolean" ? candidate.osEnabled : fallback.osEnabled,
    soundEnabled: typeof candidate.soundEnabled === "boolean" ? candidate.soundEnabled : fallback.soundEnabled,
    volume:
      typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
        ? Math.max(0, Math.min(1, candidate.volume))
        : fallback.volume,
    focusOnClick: typeof candidate.focusOnClick === "boolean" ? candidate.focusOnClick : fallback.focusOnClick,
    enabledEventTypes: enabledEventTypes.length > 0 ? enabledEventTypes : [...fallback.enabledEventTypes],
    eventSounds,
    enabledCategories: enabledCategories.length > 0 ? enabledCategories : [...fallback.enabledCategories],
  };
}

function isNotificationEventType(value: unknown): value is NotificationEventType {
  return typeof value === "string" && SUPPORTED_NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType);
}

function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === "string" && SUPPORTED_NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);
}

function isNotificationSoundId(value: unknown): value is NotificationSoundId {
  return typeof value === "string" && SUPPORTED_NOTIFICATION_SOUND_IDS.includes(value as NotificationSoundId);
}
