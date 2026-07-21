import type { DaemonInfoResult } from "@main/ipc";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { CenteredSpinner } from "@renderer/components/CenteredSpinner";
import { StatusIndicator } from "@renderer/components/StatusIndicator";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "@renderer/components/settings";
import { MONOSPACE_SX } from "@renderer/helpers/styles";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";

type DaemonConnectionSectionProps = {
  daemonInfo: DaemonInfoResult | null;
  hasLoadError: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isRestarting: boolean;
  onRefresh: () => Promise<void>;
};

/** Renders the daemon connection info card and refresh action. */
export function DaemonConnectionSection(props: DaemonConnectionSectionProps) {
  const { t } = useTranslation();
  const { daemonInfo, hasLoadError, isLoading, isRefreshing, isRestarting, onRefresh } = props;
  const statusLabel = daemonInfo ? t("settings.daemon.status.running") : t("settings.daemon.status.unavailable");

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.daemon.title")}
        description={t("settings.daemon.description")}
        action={
          <Button
            size="small"
            variant="text"
            onClick={() => {
              void onRefresh();
            }}
            disabled={isRefreshing || isLoading || isRestarting}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : <LuRefreshCw />}
          >
            {t("settings.daemon.actions.refresh")}
          </Button>
        }
      />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.daemon.loadError")}</Alert> : null}
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.daemon.rows.status")}
                control={<StatusIndicator label={statusLabel} color={daemonInfo ? "success" : "disabled"} />}
              />
              <SettingsControlRow
                title={t("settings.daemon.rows.version")}
                control={
                  <Typography variant="body2">{daemonInfo?.version || t("settings.daemon.values.unknown")}</Typography>
                }
              />
              <SettingsControlRow
                title={t("settings.daemon.rows.id")}
                control={
                  <Typography variant="body2" sx={MONOSPACE_SX}>
                    {daemonInfo?.daemonId || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
              <SettingsControlRow
                title={t("settings.daemon.rows.websocket")}
                control={
                  <Typography variant="body2" sx={MONOSPACE_SX}>
                    {daemonInfo?.wsUrl || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
            </SettingsRows>
          </>
        )}
      </SettingsCard>
    </Box>
  );
}
