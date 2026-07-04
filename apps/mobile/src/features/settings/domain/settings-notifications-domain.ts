import type { DeviceNotificationPermissionStatus } from "@/features/notifications/notifications.types";

export type NotificationOptionValue = "enabled" | "disabled" | "open-settings" | "request-permission";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function buildNotificationOptions(
  status: DeviceNotificationPermissionStatus,
  t: Translate,
): Array<{ label: string; value: NotificationOptionValue }> {
  if (status === "denied") {
    return [{ label: t("settings.notificationsPermissionOpenSettings"), value: "open-settings" }];
  }

  if (status === "undetermined" || status === "error") {
    return [{ label: t("settings.notificationsPermissionEnable"), value: "request-permission" }];
  }

  if (status === "unsupported") {
    return [];
  }

  return [
    {
      value: "enabled",
      label: t("settings.notificationsEnabled"),
    },
    {
      value: "disabled",
      label: t("settings.notificationsDisabled"),
    },
  ];
}

export function getNotificationSelectedValue({
  enabled,
  status,
}: {
  enabled: boolean;
  status: DeviceNotificationPermissionStatus;
}): NotificationOptionValue {
  if (status === "denied") {
    return "open-settings";
  }

  if (status === "undetermined" || status === "error") {
    return "request-permission";
  }

  return enabled ? "enabled" : "disabled";
}

export function getNotificationValueLabel({
  enabled,
  isLoading,
  isRequesting,
  status,
  t,
}: {
  enabled: boolean;
  isLoading: boolean;
  isRequesting: boolean;
  status: DeviceNotificationPermissionStatus;
  t: Translate;
}) {
  if (isLoading) {
    return t("settings.notificationsPermissionChecking");
  }

  if (isRequesting) {
    return t("settings.notificationsPermissionRequesting");
  }

  if (status === "denied" || status === "undetermined" || status === "error") {
    return t("settings.notificationsNeedPermission");
  }

  if (status === "unsupported") {
    return t("settings.notificationsPermissionStatusUnsupported");
  }

  return enabled ? t("settings.notificationsEnabled") : t("settings.notificationsDisabled");
}

export function resolveNotificationSelectionAction({
  status,
  value,
}: {
  status: DeviceNotificationPermissionStatus;
  value: NotificationOptionValue;
}):
  | { type: "noop" }
  | { type: "open-settings" }
  | { type: "request-permission" }
  | { enabled: boolean; type: "toggle" } {
  if (status === "unsupported") {
    return { type: "noop" };
  }

  if (value === "open-settings") {
    return { type: "open-settings" };
  }

  if (value === "request-permission") {
    return { type: "request-permission" };
  }

  return { enabled: value === "enabled", type: "toggle" };
}
