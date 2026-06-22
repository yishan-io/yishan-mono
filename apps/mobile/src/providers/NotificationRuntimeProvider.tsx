import { NotificationInAppBanner } from "@/features/notifications/components/NotificationInAppBanner";
import { useNotificationRuntimeModel } from "@/features/notifications/hooks/useNotificationRuntimeModel";
import { NotificationRuntimeContext } from "@/features/notifications/notification-runtime-context";
import type { PropsWithChildren } from "react";

/** Owns notification runtime composition and in-app banner mounting only. */
export function NotificationRuntimeProvider({ children }: PropsWithChildren) {
  const { activeBanner, openActiveBanner, runtimeValue } = useNotificationRuntimeModel();

  return (
    <NotificationRuntimeContext.Provider value={runtimeValue}>
      {children}
      {activeBanner ? <NotificationInAppBanner banner={activeBanner} onPress={openActiveBanner} /> : null}
    </NotificationRuntimeContext.Provider>
  );
}
