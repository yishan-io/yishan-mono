import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "../../shared/notifications/notificationPreferences";
import { getApiServiceClient, getDesktopHostBridge } from "../rpc/rpcTransport";

/** Loads persisted notification preferences from desktop runtime storage. */
export async function getNotificationPreferences() {
  const client = await getApiServiceClient();
  return client.notification.getNotificationPreferences(undefined);
}

/** Updates notification preferences and persists them through desktop runtime storage. */
export async function updateNotificationPreferences(patch: Partial<NotificationPreferences>) {
  const client = await getApiServiceClient();
  return client.notification.updateNotificationPreferences(patch);
}

/** Triggers one OS notification preview with current or provided preferences. */
export async function previewNotification(input: {
  eventType: NotificationEventType;
}) {
  const previewTitle = input.eventType === "run-failed" ? "Run needs attention" : "Run finished";
  return await getDesktopHostBridge().dispatchNotification({
    title: previewTitle,
    body: "Notification preview",
  });
}

/** Plays one notification sound effect payload through main-process IPC. */
export async function playNotificationSound(input: { soundId: NotificationSoundId; volume: number }) {
  return await getDesktopHostBridge().playNotificationSound(input);
}

/** Dispatches one desktop notification effect payload through main-process IPC. */
export async function dispatchNotification(input: { title: string; body?: string }) {
  return await getDesktopHostBridge().dispatchNotification(input);
}
