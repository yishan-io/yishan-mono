import { Notification } from "electron";
import { generateId } from "../../shared/helpers/generateId";
import type { NativeNotificationRequest, NotificationClickEvent, NotificationDriver } from "./types";

/**
 * Creates a generic native notification driver from a platform-specific show-notification API.
 * This keeps notification dispatch decoupled from one specific desktop runtime.
 */
function createNativeNotificationDriver(
  showNotification: (input: {
    request: NativeNotificationRequest;
    notificationId: string;
    dispatchClickEvent: (event: NotificationClickEvent) => void;
  }) => void,
): NotificationDriver {
  const clickListeners = new Set<(event?: NotificationClickEvent) => void>();

  return {
    show: async (notification) => {
      const notificationId = generateId();
      showNotification({
        request: notification,
        notificationId,
        dispatchClickEvent: (event) => {
          for (const listener of clickListeners) {
            listener(event);
          }
        },
      });
      return {
        notificationId,
      };
    },
    subscribeClick: (listener) => {
      clickListeners.add(listener);
      return () => {
        clickListeners.delete(listener);
      };
    },
  };
}

/**
 * Builds a native OS notification driver backed by Electron's `Notification` API.
 * The underlying OS notification center/action center handles icon rendering and DND behavior.
 */
export function createElectrobunNotificationDriver(): NotificationDriver {
  const activeNotificationsById = new Map<string, Notification>();

  return createNativeNotificationDriver(({ request, notificationId, dispatchClickEvent }) => {
    const notification = new Notification({
      title: request.title,
      body: request.body,
      silent: request.silent,
    });
    activeNotificationsById.set(notificationId, notification);
    notification.on("click", () => {
      dispatchClickEvent({
        notificationId,
        title: request.title,
        body: request.body,
        subtitle: request.subtitle,
      });
      activeNotificationsById.delete(notificationId);
    });
    notification.on("close", () => {
      activeNotificationsById.delete(notificationId);
    });
    notification.show();
  });
}
