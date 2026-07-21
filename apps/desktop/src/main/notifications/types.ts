import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "../../shared/notifications/notificationPreferences";

export type NativeNotificationRequest = {
  title: string;
  body?: string;
  subtitle?: string;
  silent?: boolean;
};

export type NativeNotificationResult = {
  notificationId?: string;
};

export type NotificationClickEvent = {
  notificationId?: string;
  title?: string;
  body?: string;
  subtitle?: string;
};

export type NotificationDriver = {
  show: (
    notification: NativeNotificationRequest,
  ) => Promise<NativeNotificationResult | undefined> | NativeNotificationResult | undefined;
  subscribeClick?: (listener: (event?: NotificationClickEvent) => void) => () => void;
};

export type NotificationEvent = {
  type: NotificationEventType;
  title: string;
  body?: string;
  subtitle?: string;
};

export type NotificationSoundPlayer = (input: {
  eventType: NotificationEventType;
  soundId: NotificationSoundId;
  volume: number;
}) => Promise<void> | void;

export type NotificationDispatchResult =
  | { sent: true; notificationId?: string }
  | { sent: false; reason: "notifications-disabled" | "event-disabled" };

export type NotificationSoundPreviewResult =
  | { played: true }
  | { played: false; reason: "sound-disabled" | "volume-muted" | "sound-player-unavailable" };

export type NotificationServiceOptions = {
  onNotificationClickAction?: (
    input:
      | {
          type: "focus-app";
          event?: NotificationClickEvent;
        }
      | {
          type: "navigate";
          event?: NotificationClickEvent;
          navigationPath: string;
        },
  ) => Promise<void> | void;
};

export type HookIngressEventContext = {
  agent: "codex" | "claude" | "opencode" | "unknown";
  workspaceId: string;
  tabId: string;
  sessionKey: string;
  normalizedEventType: "start" | "wait_input" | "stop" | "unknown";
};

export type DesktopNotificationHostAdapter = {
  driver: NotificationDriver;
  playSound: NotificationSoundPlayer;
  onNotificationClickAction?: NotificationServiceOptions["onNotificationClickAction"];
};

export type { NotificationEventType, NotificationPreferences, NotificationSoundId };
