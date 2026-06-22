import { Bell } from "@tamagui/lucide-icons";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { DeviceNotificationPermissionStatus } from "@/features/notifications/notifications.types";
import { type SettingsSelectorOption, SettingsSelectorSheet } from "./SettingsSelectorSheet";
import {
  type NotificationOptionValue,
  buildNotificationOptions,
  getNotificationSelectedValue,
  getNotificationValueLabel,
  resolveNotificationSelectionAction,
} from "./settings-notifications-domain";

type SettingsNotificationsSectionProps = {
  enabled: boolean;
  isLoading: boolean;
  isRequesting: boolean;
  onOpenSystemSettings: () => void;
  onRequestPermission: () => void;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
  status: DeviceNotificationPermissionStatus;
};

export function SettingsNotificationsSection({
  enabled,
  isLoading,
  isRequesting,
  onOpenSystemSettings,
  onRequestPermission,
  onToggle,
  pending,
  status,
}: SettingsNotificationsSectionProps) {
  const { t } = useAppLanguage();
  const selectedValue = getNotificationSelectedValue({ enabled, status });
  const selectedLabel = getNotificationValueLabel({ enabled, isLoading, isRequesting, status, t });
  const options: SettingsSelectorOption<NotificationOptionValue>[] = buildNotificationOptions(status, t);

  return (
    <SettingsSelectorSheet
      leadingIcon={<Bell color="$color11" size={18} />}
      label={t("settings.notificationsTitle")}
      title={t("settings.notificationsTitle")}
      selectedLabel={selectedLabel}
      selectedValue={selectedValue}
      options={options}
      onSelect={(value) => {
        const action = resolveNotificationSelectionAction({ status, value });

        if (action.type === "noop") {
          return;
        }

        if (action.type === "open-settings") {
          onOpenSystemSettings();
          return;
        }

        if (action.type === "request-permission") {
          onRequestPermission();
          return;
        }

        onToggle(action.enabled);
      }}
      disabled={pending || isLoading || isRequesting || status === "unsupported"}
    />
  );
}
