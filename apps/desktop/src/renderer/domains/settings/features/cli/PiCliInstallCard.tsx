import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { MONOSPACE_SX } from "@renderer/ui/typography";
import { isNewerVersion } from "@renderer/version/version";
import { useTranslation } from "react-i18next";
import { BiTerminal } from "react-icons/bi";
import type { CLIToolStatus } from "../../../../domains/settings/commands/cliToolCommands";
import { CenteredSpinner } from "../../../../ui/components/CenteredSpinner";
import { SettingsCard, SettingsControlRow, SettingsRows } from "../../../../ui/components/SettingsPrimitives";

type PiCliInstallCardProps = {
  status: CLIToolStatus | null;
  isLoading: boolean;
  isInstalling: boolean;
  error: string | null;
  onInstall: () => void;
};

/** Renders the pi CLI row with PATH detection status and Install/Update actions. */
export function PiCliInstallCard(props: PiCliInstallCardProps) {
  const { t } = useTranslation();
  const { status, isLoading, isInstalling, error, onInstall } = props;
  const isInstalled = Boolean(status?.installed);
  const hasNewerVersion = isNewerVersion(status?.version, status?.latestVersion);
  const latestVersionKnown = status?.latestVersion !== undefined;
  // Up to date requires a known installed version; with an unknown version we
  // fall back to offering an update so the card can never claim a false state.
  const isUpToDate = isInstalled && status?.version !== undefined && latestVersionKnown && !hasNewerVersion;

  const statusLabel = isInstalled
    ? status?.version
      ? `v${status.version}`
      : status?.resolvedPath || t("settings.cli.pi.status.versionUnknown")
    : t("settings.cli.pi.status.notInstalled");

  const buttonLabel = isInstalling
    ? isInstalled
      ? t("settings.cli.pi.update.inProgress")
      : t("settings.cli.pi.install.inProgress")
    : !isInstalled
      ? t("settings.cli.pi.install.action")
      : isUpToDate
        ? t("settings.cli.pi.status.upToDate")
        : t("settings.cli.pi.update.action");

  return (
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
                  <Box component="span">{t("settings.cli.pi.title")}</Box>
                </Typography>
              }
              description={t("settings.cli.pi.description")}
              control={<Box component="span" />}
            />
            <SettingsControlRow
              title={
                <Typography variant="body2" sx={isInstalled ? MONOSPACE_SX : undefined}>
                  {statusLabel}
                </Typography>
              }
              control={
                <Button
                  size="small"
                  variant="text"
                  disabled={isInstalling || isUpToDate}
                  onClick={onInstall}
                  startIcon={isInstalling ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  {buttonLabel}
                </Button>
              }
            />
          </SettingsRows>
        </>
      )}
    </SettingsCard>
  );
}
