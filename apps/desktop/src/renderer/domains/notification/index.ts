/**
 * Notification feature public API (Phase 12, desktop5.md).
 */

export {
  resolveWorkspaceNotificationColor,
  type WorkspaceNotificationColor,
  type WorkspaceNotificationTone,
} from "./ui/workspaceNotificationTone";

export {
  dispatchNotification,
  getNotificationPreferences,
  playNotificationSound,
  previewNotification,
  updateNotificationPreferences,
} from "./commands/notificationCommands";
export { createNotificationEventHandlers } from "./subscriptions/notificationEventHandlers";
// Notification configuration UI composed by the Settings shell + search
// catalog (desktop7 Phase 23).
export { NotificationSettingsView } from "./features/configure-notifications/NotificationSettingsView";
export {
  NOTIFICATION_SETTINGS_FOCUS_ITEM_IDS,
  NOTIFICATION_SETTINGS_SEARCH_ITEMS,
  isNotificationSettingsFocusItemId,
  type NotificationSettingsFocusItemId,
  type NotificationSettingsSearchItem,
} from "./features/configure-notifications/notificationSettingsCatalog";
