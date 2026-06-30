import type { DeviceNotificationPermissionStatus } from "./notifications.types";

export function shouldScheduleNativeNotification(input: {
  appState: string;
  bannerTerminalId: string | null;
  currentKind: string | null;
  currentTerminalId: string | null;
  hasBlockingOverlay: boolean;
  notificationPermissionStatus: DeviceNotificationPermissionStatus;
  osNotificationsEnabled: boolean | undefined;
}) {
  const isFocusedTerminal =
    input.appState === "active" &&
    !input.hasBlockingOverlay &&
    input.currentKind === "terminal" &&
    input.bannerTerminalId !== null &&
    input.bannerTerminalId === input.currentTerminalId;

  if (input.notificationPermissionStatus !== "granted") {
    return false;
  }

  if (!input.osNotificationsEnabled) {
    return false;
  }

  if (isFocusedTerminal) {
    return false;
  }

  return true;
}
