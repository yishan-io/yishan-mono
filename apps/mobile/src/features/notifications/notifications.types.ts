export type DeviceNotificationPermissionStatus = "granted" | "denied" | "undetermined" | "unsupported" | "error";

export const SUPPORTED_NOTIFICATION_EVENT_TYPES = ["run-finished", "run-failed", "pending-question"] as const;
export type NotificationEventType = (typeof SUPPORTED_NOTIFICATION_EVENT_TYPES)[number];

export const SUPPORTED_NOTIFICATION_SOUND_IDS = ["chime", "ping", "pop", "zip", "alert"] as const;
export type NotificationSoundId = (typeof SUPPORTED_NOTIFICATION_SOUND_IDS)[number];

export const SUPPORTED_NOTIFICATION_CATEGORIES = ["ai-task"] as const;
export type NotificationCategory = (typeof SUPPORTED_NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = {
  schemaVersion: number;
  enabled: boolean;
  osEnabled: boolean;
  soundEnabled: boolean;
  volume: number;
  focusOnClick: boolean;
  enabledEventTypes: NotificationEventType[];
  eventSounds: Record<NotificationEventType, NotificationSoundId>;
  enabledCategories: NotificationCategory[];
};

export type FrontendNotificationEventPayload = {
  id: string;
  title: string;
  body?: string;
  tone: "success" | "error";
  createdAt: string;
  agent?: string;
  workspaceId?: string;
  workspaceName?: string;
  sessionId?: string;
  navigationPath?: string;
  notificationEventType?: NotificationEventType;
  silent?: boolean;
  showSystemNotification?: boolean;
  soundToPlay?: {
    soundId: NotificationSoundId;
    volume: number;
  };
  observerStatus?: {
    normalizedEventType: "start" | "wait_input" | "stop" | "unknown";
    sessionKey: string;
  };
};
