import type { DaemonInfoResult } from "@main/ipc";
import { Box, Typography } from "@mui/material";
import { CenteredSpinner } from "@renderer/components/CenteredSpinner";
import { StatusIndicator } from "@renderer/components/StatusIndicator";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "@renderer/components/settings";
import { MONOSPACE_SX } from "@renderer/helpers/styles";
import { useTranslation } from "react-i18next";

type DaemonRelaySectionProps = {
  daemonInfo: DaemonInfoResult | null;
  isLoading: boolean;
};

/** Renders relay status details for the daemon. */
export function DaemonRelaySection(props: DaemonRelaySectionProps) {
  const { t } = useTranslation();
  const { daemonInfo, isLoading } = props;
  const relay = daemonInfo?.relay;
  const relayStatusLabel = !relay?.enabled
    ? t("settings.daemon.relay.status.disabled")
    : relay.connected
      ? t("settings.daemon.relay.status.connected")
      : t("settings.daemon.relay.status.disconnected");
  const relayStatusColor = !relay?.enabled ? "disabled" : relay.connected ? "success" : "error";

  return (
    <Box sx={{ mt: 3 }}>
      <SettingsSectionHeader
        title={t("settings.daemon.relay.title")}
        description={t("settings.daemon.relay.description")}
      />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <SettingsRows>
            <SettingsControlRow
              title={t("settings.daemon.relay.rows.status")}
              control={<StatusIndicator label={relayStatusLabel} color={relayStatusColor} />}
            />
            <SettingsControlRow
              title={t("settings.daemon.relay.rows.url")}
              control={
                <Typography variant="body2" sx={MONOSPACE_SX}>
                  {relay?.url || t("settings.daemon.values.unknown")}
                </Typography>
              }
            />
            {relay?.connectedAt ? (
              <SettingsControlRow
                title={t("settings.daemon.relay.rows.connectedAt")}
                control={<Typography variant="body2">{new Date(relay.connectedAt).toLocaleString()}</Typography>}
              />
            ) : null}
            {relay?.lastError ? (
              <SettingsControlRow
                title={t("settings.daemon.relay.rows.lastError")}
                control={
                  <Typography variant="body2" color="error">
                    {relay.lastError}
                  </Typography>
                }
              />
            ) : null}
          </SettingsRows>
        )}
      </SettingsCard>
    </Box>
  );
}
