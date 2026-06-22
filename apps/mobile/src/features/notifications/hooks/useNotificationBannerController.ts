import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useShellUiFocusState } from "@/features/shell/state/shellUiFocusStore";
import { shouldScheduleNativeNotification } from "../notification-banner-controller-domain";
import type { InAppNotificationBanner } from "../notification-runtime-helpers";
import type { DeviceNotificationPermissionStatus } from "../notifications.types";
import { useNotificationNativeBridge } from "./useNotificationNativeBridge";
import { useNotificationRouteContext } from "./useNotificationRouteContext";

export function useNotificationBannerController({
  notificationPermissionStatus,
  osNotificationsEnabled,
}: {
  notificationPermissionStatus: DeviceNotificationPermissionStatus;
  osNotificationsEnabled: boolean | undefined;
}) {
  const { currentKind, currentTerminalId } = useNotificationRouteContext();
  const { navigateToNotificationTarget } = useNotificationNativeBridge();
  const shellUiFocus = useShellUiFocusState();
  const bannerDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeBanner, setActiveBanner] = useState<InAppNotificationBanner | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (bannerDismissTimeoutRef.current) {
        clearTimeout(bannerDismissTimeoutRef.current);
        bannerDismissTimeoutRef.current = null;
      }
    };
  }, []);

  const showBanner = useCallback((banner: InAppNotificationBanner) => {
    if (bannerDismissTimeoutRef.current) {
      clearTimeout(bannerDismissTimeoutRef.current);
    }

    setActiveBanner(banner);
    bannerDismissTimeoutRef.current = setTimeout(() => {
      bannerDismissTimeoutRef.current = null;
      setActiveBanner((current) =>
        current?.workspaceId === banner.workspaceId && current.title === banner.title && current.body === banner.body
          ? null
          : current,
      );
    }, 5000);
  }, []);

  const dismissBanner = useCallback(() => {
    setActiveBanner(null);
  }, []);

  const openActiveBanner = useCallback(() => {
    if (!activeBanner) {
      return;
    }

    setActiveBanner(null);
    navigateToNotificationTarget({
      orgId: activeBanner.orgId,
      projectId: activeBanner.projectId,
      terminalId: activeBanner.terminalId,
      workspaceId: activeBanner.workspaceId,
    });
  }, [activeBanner, navigateToNotificationTarget]);

  const scheduleNativeNotification = useCallback(
    async (banner: InAppNotificationBanner, eventType: string) => {
      if (
        !shouldScheduleNativeNotification({
          appState,
          bannerTerminalId: banner.terminalId,
          currentKind,
          currentTerminalId,
          hasBlockingOverlay: shellUiFocus.hasBlockingOverlay,
          notificationPermissionStatus,
          osNotificationsEnabled,
        })
      ) {
        return;
      }

      await import("expo-notifications")
        .then((Notifications) =>
          Notifications.scheduleNotificationAsync({
            content: {
              title: banner.title,
              body: banner.body,
              data: {
                kind: banner.terminalId ? "terminal" : "workspace",
                notificationEventType: eventType,
                orgId: banner.orgId,
                projectId: banner.projectId,
                ...(banner.terminalId ? { terminalId: banner.terminalId } : {}),
                workspaceId: banner.workspaceId,
              },
            },
            trigger: null,
          }),
        )
        .catch(() => {
          // Best-effort native presentation only.
        });
    },
    [
      appState,
      currentKind,
      currentTerminalId,
      notificationPermissionStatus,
      osNotificationsEnabled,
      shellUiFocus.hasBlockingOverlay,
    ],
  );

  return {
    activeBanner,
    dismissBanner,
    openActiveBanner,
    scheduleNativeNotification,
    showBanner,
  };
}
