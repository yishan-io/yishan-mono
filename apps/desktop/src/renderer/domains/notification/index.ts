/**
 * Notification feature public API.
 */

export {
  resolveWorkspaceNotificationColor,
  type WorkspaceNotificationColor,
  type WorkspaceNotificationTone,
} from "./ui/workspaceNotificationTone";

export {
  getNotificationPreferences,
  playNotificationSound,
  previewNotification,
  updateNotificationPreferences,
} from "./commands/notificationCommands";
export { createNotificationEventHandlers } from "./subscriptions/notificationEventHandlers";
// Notification configuration UI composed by the Settings shell + search
// catalog.
export { NotificationSettingsView } from "./features/configure-notifications/NotificationSettingsView";
export {
  NOTIFICATION_SETTINGS_SEARCH_ITEMS,
  isNotificationSettingsFocusItemId,
  type NotificationSettingsFocusItemId,
  type NotificationSettingsSearchItem,
} from "./features/configure-notifications/notificationSettingsCatalog";
