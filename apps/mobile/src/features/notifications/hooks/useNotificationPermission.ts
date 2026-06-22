import type { NotificationPermissionsStatus } from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, type AppStateStatus, Linking, Platform } from "react-native";

import type { DeviceNotificationPermissionStatus } from "@/features/notifications/notifications.types";

function toDevicePermissionStatus(
  settings: NotificationPermissionsStatus,
  iosAuthorizationStatus?: {
    EPHEMERAL: number;
    PROVISIONAL: number;
  },
): DeviceNotificationPermissionStatus {
  if (
    settings.granted ||
    settings.ios?.status === iosAuthorizationStatus?.PROVISIONAL ||
    settings.ios?.status === iosAuthorizationStatus?.EPHEMERAL
  ) {
    return "granted";
  }

  if (settings.status === "denied") {
    return "denied";
  }

  return "undetermined";
}

/** Owns device notification permission read, request, and refresh behavior. */
export function useNotificationPermission() {
  const [status, setStatus] = useState<DeviceNotificationPermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);

  const refreshPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      setStatus("unsupported");
      setIsLoading(false);
      return;
    }

    try {
      const Notifications = await import("expo-notifications");
      const nextSettings = await Notifications.getPermissionsAsync();
      setStatus(toDevicePermissionStatus(nextSettings, Notifications.IosAuthorizationStatus));
    } catch {
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        void refreshPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshPermission]);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      setStatus("unsupported");
      return false;
    }

    try {
      setIsRequesting(true);
      const Notifications = await import("expo-notifications");
      const nextSettings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      const nextStatus = toDevicePermissionStatus(nextSettings, Notifications.IosAuthorizationStatus);
      setStatus(nextStatus);
      return nextStatus === "granted";
    } catch {
      setStatus("error");
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const openSystemSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  return {
    isLoading,
    isRequesting,
    openSystemSettings,
    refreshPermission,
    requestPermission,
    status,
  };
}
