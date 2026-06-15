import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BiTerminal } from "react-icons/bi";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsControlRow, SettingsRows } from "../../components/settings";
import { MONOSPACE_SX } from "../../helpers/styles";

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
  isUninstalling: boolean;
  error: string | null;
  onInstall: () => void;
  onUninstall: () => void;
};

export function DaemonCliInstallCard(props: DaemonCliInstallCardProps) {
  const { t } = useTranslation();
  const { status, isLoading, isInstalling, isUninstalling, error, onInstall, onUninstall } = props;
  const isInstalled = Boolean(status?.isAvailableInPath);
  // Only allow uninstalling if we created the managed symlink. If the binary
  // was installed independently (isManagedInstall === false), we must not delete it.
  const canUninstall = isInstalled && Boolean(status?.isManagedInstall);
  const statusLabel = isInstalled
    ? status?.resolvedPath || t("settings.daemon.values.unknown")
    : t("settings.daemon.cli.status.notInstalled");

  return (
    <>
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
                title={
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
                  >
                    <BiTerminal size={18} />
                    <Box component="span">{t("settings.daemon.cli.title")}</Box>
                  </Typography>
                }
                description={t("settings.daemon.cli.description")}
                control={<Box component="span" />}
              />
              <SettingsControlRow
                title={
                  <Typography variant="body2" sx={isInstalled ? MONOSPACE_SX : undefined}>
                    {statusLabel}
                  </Typography>
                }
                control={
                  isInstalled ? (
                    <Button
                      size="small"
                      variant="text"
                      color="error"
                      disabled={isUninstalling || !canUninstall}
                      onClick={onUninstall}
                      startIcon={isUninstalling ? <CircularProgress size={14} color="inherit" /> : undefined}
                    >
                      {isUninstalling
                        ? t("settings.daemon.cli.uninstall.inProgress")
                        : t("settings.daemon.cli.uninstall.action")}
                    </Button>
                  ) : (
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
                  )
                }
              />
            </SettingsRows>
          </>
        )}
      </SettingsCard>
    </>
  );
}
