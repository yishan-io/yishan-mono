import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "@shared/notifications/notificationPreferences";

/**
 * Represents one queued sound preview request while another preview is in flight.
 */
export type PendingSoundPreviewRequest = {
  eventType: NotificationEventType;
  previewPatch: NotificationPreferences;
  soundId: NotificationSoundId;
};

/**
 * Identifies which notification-settings operation last failed.
 */
export type NotificationSettingsErrorKey = "load" | "save" | "preview" | "previewSound" | null;

/**
 * Represents the transient notification preview result shown in the UI.
 */
export type NotificationPreviewStatus = "sent" | "blocked" | null;
