import { Alert, Box, Button, Chip, Stack } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiBluetooth, BiCamera, BiChip, BiHdd, BiShield, BiSolidKeyboard, BiUsb, BiWindow } from "react-icons/bi";
import { LuGlobe } from "react-icons/lu";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
} from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { getRendererPlatform } from "../../helpers/platform";
import type { ComputerPermissionState, ComputerPermissionStatus } from "../../rpc/daemonTypes";
import { getDaemonClient } from "../../rpc/rpcTransport";

type PermissionRowKey = "accessibility" | "screenRecording" | "inputMonitoring" | "automation";

const PERMISSION_ROWS: Array<{
  key: PermissionRowKey;
  titleKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  {
    key: "accessibility",
    titleKey: "settings.computerUse.permissions.accessibility",
    descriptionKey: "settings.computerUse.permissions.accessibilityDescription",
    icon: BiWindow,
  },
  {
    key: "screenRecording",
    titleKey: "settings.computerUse.permissions.screenRecording",
    descriptionKey: "settings.computerUse.permissions.screenRecordingDescription",
    icon: BiCamera,
  },
  {
    key: "inputMonitoring",
    titleKey: "settings.computerUse.permissions.inputMonitoring",
    descriptionKey: "settings.computerUse.permissions.inputMonitoringDescription",
    icon: BiSolidKeyboard,
  },
  {
    key: "automation",
    titleKey: "settings.computerUse.permissions.automation",
    descriptionKey: "settings.computerUse.permissions.automationDescription",
    icon: BiChip,
  },
];

const INFORMATIONAL_ROWS: Array<{
  key: string;
  titleKey: string;
  descriptionKey: string;
  statusKey: string;
  actionLabelKey: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  {
    key: "camera",
    titleKey: "settings.computerUse.permissions.camera",
    descriptionKey: "settings.computerUse.permissions.cameraDescription",
    statusKey: "notRequested",
    actionLabelKey: "requestButton",
    icon: BiCamera,
  },
  {
    key: "fullDiskAccess",
    titleKey: "settings.computerUse.permissions.fullDiskAccess",
    descriptionKey: "settings.computerUse.permissions.fullDiskAccessDescription",
    statusKey: "checkManually",
    actionLabelKey: "openSettingsButton",
    icon: BiHdd,
  },
  {
    key: "localNetwork",
    titleKey: "settings.computerUse.permissions.localNetwork",
    descriptionKey: "settings.computerUse.permissions.localNetworkDescription",
    statusKey: "checkManually",
    actionLabelKey: "triggerPromptButton",
    icon: LuGlobe,
  },
  {
    key: "usbDevices",
    titleKey: "settings.computerUse.permissions.usbDevices",
    descriptionKey: "settings.computerUse.permissions.usbDevicesDescription",
    statusKey: "entitled",
    actionLabelKey: "openSettingsButton",
    icon: BiUsb,
  },
  {
    key: "bluetooth",
    titleKey: "settings.computerUse.permissions.bluetooth",
    descriptionKey: "settings.computerUse.permissions.bluetoothDescription",
    statusKey: "entitled",
    actionLabelKey: "openSettingsButton",
    icon: BiBluetooth,
  },
];

export function ComputerUseSettingsView() {
  const { t } = useTranslation();
  const platform = getRendererPlatform();
  const [permissions, setPermissions] = useState<ComputerPermissionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const client = await getDaemonClient();
      const next = await client.computer.permissions();
      setPermissions(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const openPermissionSettings = useCallback(async (permission: "accessibility" | "screenRecording") => {
    try {
      const client = await getDaemonClient();
      await client.computer.openPermissionSettings({ permission });
      setActionError(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }, []);

  if (platform !== "darwin") {
    return (
      <Stack spacing={2} data-testid="computer-use-settings-panel">
        <Box>
          <SettingsSectionHeader
            title={t("settings.computerUse.title")}
            description={t("settings.computerUse.description")}
            action={<Chip size="small" label={t("settings.computerUse.experimental")} variant="outlined" />}
          />
          <Alert severity="info">{t("settings.computerUse.macOSOnly")}</Alert>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} data-testid="computer-use-settings-panel">
      <Box>
        <SettingsSectionHeader
          title={t("settings.computerUse.title")}
          description={t("settings.computerUse.description")}
          action={<Chip size="small" label={t("settings.computerUse.experimental")} variant="outlined" />}
        />
        <SettingsCard>
          <SettingsRows>
            {PERMISSION_ROWS.map((row) => (
              <Box key={row.key} sx={{ py: 1 }}>
                <SettingsControlRow
                  title={
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, minWidth: 0 }}>
                      <Box sx={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25 }}>
                        <row.icon size={20} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flexWrap: "wrap" }}>
                          <Box sx={{ typography: "body2", lineHeight: 1.35 }}>{t(row.titleKey)}</Box>
                          <Chip
                            size="small"
                            label={t(`settings.computerUse.status.${permissions?.[row.key] ?? "unknown"}`)}
                            color={capabilityColor(permissions?.[row.key] ?? "unknown")}
                            variant="outlined"
                            sx={{ height: 18, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                          />
                        </Box>
                        <Box sx={{ typography: "caption", color: "text.secondary", lineHeight: 1.4, mt: 0.25 }}>
                          {t(row.descriptionKey)}
                        </Box>
                      </Box>
                    </Box>
                  }
                  control={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {row.key === "accessibility" && permissions?.accessibility !== "granted" ? (
                        <Button size="small" onClick={() => void openPermissionSettings("accessibility")}>{t("settings.computerUse.permissions.openAccessibilityButton")}</Button>
                      ) : null}
                      {row.key === "screenRecording" && permissions?.screenRecording !== "granted" ? (
                        <Button size="small" onClick={() => void openPermissionSettings("screenRecording")}>{t("settings.computerUse.permissions.openScreenRecordingButton")}</Button>
                      ) : null}
                    </Box>
                  }
                />
              </Box>
            ))}
            {INFORMATIONAL_ROWS.map((row) => (
              <Box key={row.key} sx={{ py: 1 }}>
                <SettingsControlRow
                  title={
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, minWidth: 0 }}>
                      <Box sx={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25 }}>
                        <row.icon size={20} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flexWrap: "wrap" }}>
                          <Box sx={{ typography: "body2", lineHeight: 1.35 }}>{t(row.titleKey)}</Box>
                          <Chip
                            size="small"
                            label={t(`settings.computerUse.status.${row.statusKey}`)}
                            color={informationalStatusColor(row.statusKey)}
                            variant="outlined"
                            sx={{ height: 18, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                          />
                        </Box>
                        <Box sx={{ typography: "caption", color: "text.secondary", lineHeight: 1.4, mt: 0.25 }}>
                          {t(row.descriptionKey)}
                        </Box>
                      </Box>
                    </Box>
                  }
                  control={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Button size="small" disabled>{t(`settings.computerUse.permissions.${row.actionLabelKey}`)}</Button>
                    </Box>
                  }
                />
              </Box>
            ))}
          </SettingsRows>
        </SettingsCard>
      </Box>

      <Alert severity="info">{t("settings.computerUse.approvalNotice")}</Alert>
      {loadError ? <Alert severity="error">{loadError}</Alert> : null}
      {actionError ? <Alert severity="error">{actionError}</Alert> : null}
    </Stack>
  );
}

function capabilityColor(permission: ComputerPermissionState) {
  switch (permission) {
    case "granted":
    case "notRequired":
      return "success" as const;
    case "denied":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function informationalStatusColor(statusKey: string) {
	if (statusKey === "entitled") {
		return "success" as const;
	}
	if (statusKey === "checkManually") {
		return "default" as const;
	}
	return "warning" as const;
}
