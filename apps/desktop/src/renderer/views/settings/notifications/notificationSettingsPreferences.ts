import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationEventType,
  type NotificationPreferences,
  SUPPORTED_NOTIFICATION_CATEGORIES,
  SUPPORTED_NOTIFICATION_EVENT_TYPES,
  SUPPORTED_NOTIFICATION_SOUND_IDS,
} from "@shared/notifications/notificationPreferences";

function filterSupportedValues<T extends string>(
  values: unknown,
  supportedValues: readonly T[],
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(values)) {
    return [...fallback];
  }

  const supportedValueSet = new Set(supportedValues);

  return [
    ...new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value): value is T => supportedValueSet.has(value as T)),
    ),
  ];
}

/**
 * Normalizes one potentially partial preference payload into a safe full snapshot.
 */
export function normalizeNotificationPreferencesSnapshot(
  preferences: Partial<NotificationPreferences> | undefined,
  fallback: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): NotificationPreferences {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  const safePreferences = preferences ?? {};
  const enabledEventTypes = filterSupportedValues<NotificationEventType>(
    safePreferences.enabledEventTypes,
    SUPPORTED_NOTIFICATION_EVENT_TYPES,
    fallback.enabledEventTypes,
  );
  const enabledCategories = filterSupportedValues<NotificationCategory>(
    safePreferences.enabledCategories,
    SUPPORTED_NOTIFICATION_CATEGORIES,
    fallback.enabledCategories,
  );

  const supportedSoundIdSet = new Set(SUPPORTED_NOTIFICATION_SOUND_IDS);
  const eventSounds = SUPPORTED_NOTIFICATION_EVENT_TYPES.reduce<NotificationPreferences["eventSounds"]>(
    (nextEventSounds, eventType) => {
      const candidateSoundId = safePreferences.eventSounds?.[eventType];
      nextEventSounds[eventType] =
        typeof candidateSoundId === "string" && supportedSoundIdSet.has(candidateSoundId)
          ? candidateSoundId
          : fallback.eventSounds[eventType];
      return nextEventSounds;
    },
    { ...fallback.eventSounds },
  );

  return {
    ...defaults,
    ...fallback,
    ...safePreferences,
    enabledEventTypes,
    enabledCategories,
    eventSounds,
  };
}
