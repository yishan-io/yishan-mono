import type { NotificationSoundId } from "../../shared/notifications/notificationPreferences";
import type { NotificationDispatchResult, NotificationSoundPreviewResult } from "../notifications/types";

export type DispatchNotificationInput = {
  title: string;
  body?: string;
  silent?: boolean;
};

export type PlayNotificationSoundInput = {
  soundId: NotificationSoundId;
  volume: number;
};

export type { NotificationDispatchResult, NotificationSoundPreviewResult };
