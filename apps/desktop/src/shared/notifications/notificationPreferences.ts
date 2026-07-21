export const SUPPORTED_NOTIFICATION_EVENT_TYPES = ["run-finished", "run-failed", "pending-question"] as const;
export type NotificationEventType = (typeof SUPPORTED_NOTIFICATION_EVENT_TYPES)[number];
export const SUPPORTED_NOTIFICATION_SOUND_IDS = ["chime", "ping", "pop", "zip", "alert"] as const;
export type NotificationSoundId = (typeof SUPPORTED_NOTIFICATION_SOUND_IDS)[number];
export type NotificationEventSoundMap = Record<NotificationEventType, NotificationSoundId>;
export const CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION = 2;

export type NotificationPreferences = {
  schemaVersion: number;
  enabled: boolean;
  osEnabled: boolean;
  soundEnabled: boolean;
  volume: number;
  focusOnClick: boolean;
  enabledEventTypes: NotificationEventType[];
  eventSounds: NotificationEventSoundMap;
};

const DEFAULT_ENABLED_NOTIFICATION_EVENTS = [...SUPPORTED_NOTIFICATION_EVENT_TYPES];
const DEFAULT_EVENT_SOUNDS: NotificationEventSoundMap = {
  "run-finished": "chime",
  "run-failed": "alert",
  "pending-question": "ping",
};

/** Default notification preferences used when callers do not provide an override. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  schemaVersion: CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  enabled: true,
  osEnabled: true,
  soundEnabled: true,
  volume: 1,
  focusOnClick: true,
  enabledEventTypes: DEFAULT_ENABLED_NOTIFICATION_EVENTS,
  eventSounds: { ...DEFAULT_EVENT_SOUNDS },
};
