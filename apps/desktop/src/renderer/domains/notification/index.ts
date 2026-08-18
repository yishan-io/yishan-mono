/**
 * Notification feature public API (Phase 12, desktop5.md).
 */
export type { NotificationCommands } from "./commands/contract";

export {
  resolveWorkspaceNotificationColor,
  resolveWorkspaceNotificationTone,
  type WorkspaceNotificationColor,
  type WorkspaceNotificationTone,
} from "./model/workspaceNotification";
