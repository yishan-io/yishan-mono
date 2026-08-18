import type * as notificationCommands from "./notificationCommands";

/**
 * NotificationCommands — the public command surface for the Notification
 * feature (Phase 12, desktop5.md). Declared by the owning module;
 * `contracts/conformance.ts` enforces the contract at typecheck time.
 */
export type NotificationCommands = {
  getNotificationPreferences: typeof notificationCommands.getNotificationPreferences;
  updateNotificationPreferences: typeof notificationCommands.updateNotificationPreferences;
  previewNotification: typeof notificationCommands.previewNotification;
  playNotificationSound: typeof notificationCommands.playNotificationSound;
  dispatchNotification: typeof notificationCommands.dispatchNotification;
};
