import { Alert, Button, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
} from "../../components/settings";
import { MONOSPACE_SX } from "../../helpers/styles";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { StatusIndicator } from "../../components/StatusIndicator";

type CliStatus = {
  isAvailableInPath: boolean;
  resolvedPath?: string;
  isManagedInstall: boolean;
  installPath: string;
  bundledCliPath: string;
};

type DaemonCliInstallCardProps = {
  status: CliStatus | null;
  isLoading: boolean;
  isInstalling: boolean;
  error: string | null;
  onRefresh: () => void;
  onInstall: () => void;
};

export function DaemonCliInstallCard(props: DaemonCliInstallCardProps) {
  const { t } = useTranslation();
  const { status, isLoading, isInstalling, error, onRefresh, onInstall } = props;

  return (
    <>
      <SettingsSectionHeader
        title={t("settings.daemon.cli.title")}
        description={t("settings.daemon.cli.description")}
        action={
          <Button
            size="small"
            variant="text"
            onClick={onRefresh}
            disabled={isLoading || isInstalling}
            startIcon={isLoading ? <CircularProgress size={14} /> : <LuRefreshCw />}
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
            {error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : null}
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.daemon.cli.rows.status")}
                control={
                  <StatusIndicator
                    label={
                      status?.isAvailableInPath
                        ? t("settings.daemon.cli.status.installed")
                        : t("settings.daemon.cli.status.notInstalled")
                    }
                    color={status?.isAvailableInPath ? "success" : "disabled"}
                  />
                }
              />
              {!status?.isAvailableInPath ? (
                <SettingsControlRow
                  title={t("settings.daemon.cli.install.action")}
                  control={
                    <Button
                      size="small"
                      variant="text"
                      disabled={isInstalling}
                      onClick={onInstall}
                      startIcon={isInstalling ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                      {isInstalling
                        ? t("settings.daemon.cli.install.inProgress")
                        : t("settings.daemon.cli.install.action")}
                    </Button>
                  }
                />
              ) : null}
              <SettingsControlRow
                title={t("settings.daemon.cli.rows.detectedPath")}
                control={
                  <Typography variant="body2" sx={MONOSPACE_SX}>
                    {status?.resolvedPath || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
              {status?.isManagedInstall ? (
                <SettingsControlRow
                  title={t("settings.daemon.cli.rows.installPath")}
                  control={
                    <Typography variant="body2" sx={MONOSPACE_SX}>
                      {status.installPath}
                    </Typography>
                  }
                />
              ) : null}
              {status?.isAvailableInPath ? (
                <SettingsControlRow
                  title={t("settings.daemon.cli.rows.mode")}
                  control={
                    <Typography variant="body2">
                      {status.isManagedInstall
                        ? t("settings.daemon.cli.mode.managed")
                        : t("settings.daemon.cli.mode.external")}
                    </Typography>
                  }
                />
              ) : null}
            </SettingsRows>
          </>
        )}
      </SettingsCard>
    </>
  );
}
