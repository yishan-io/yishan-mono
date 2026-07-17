import { Alert, Box, Button, CircularProgress } from "@mui/material";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
  SettingsToggleRow,
} from "@renderer/components/settings";
import { useTranslation } from "react-i18next";
import { LuPower } from "react-icons/lu";

type DaemonControlsSectionProps = {
  isLoading: boolean;
  isLoadingQuitOnExit: boolean;
  isRestarting: boolean;
  isSavingQuitOnExit: boolean;
  onOpenLog: () => Promise<void>;
  onQuitOnExitChange: (nextChecked: boolean) => Promise<void>;
  onRestart: () => void;
  quitOnExit: boolean;
  restartError: string | null;
};

/** Renders daemon restart, log, and quit-on-exit controls. */
export function DaemonControlsSection(props: DaemonControlsSectionProps) {
  const { t } = useTranslation();
  const {
    isLoading,
    isLoadingQuitOnExit,
    isRestarting,
    isSavingQuitOnExit,
    onOpenLog,
    onQuitOnExitChange,
    onRestart,
    quitOnExit,
    restartError,
  } = props;

  return (
    <Box sx={{ mt: 3 }}>
      <SettingsSectionHeader
        title={t("settings.daemon.controls.title")}
        description={t("settings.daemon.controls.description")}
      />
      <SettingsCard>
        {restartError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {restartError}
          </Alert>
        ) : null}
        <SettingsRows>
          <SettingsControlRow
            title={t("settings.daemon.restart.label")}
            description={t("settings.daemon.restart.description")}
            control={
              <Button
                size="small"
                variant="text"
                color="primary"
                onClick={onRestart}
                disabled={isRestarting || isLoading}
                startIcon={isRestarting ? <CircularProgress size={14} color="inherit" /> : <LuPower />}
              >
                {isRestarting ? t("settings.daemon.restart.inProgress") : t("settings.daemon.restart.action")}
              </Button>
            }
          />
          <SettingsControlRow
            title={t("settings.daemon.log.label")}
            description={t("settings.daemon.log.description")}
            control={
              <Button
                size="small"
                variant="text"
                color="primary"
                onClick={() => {
                  void onOpenLog();
                }}
                disabled={isLoading}
              >
                {t("settings.daemon.log.action")}
              </Button>
            }
          />
          <SettingsToggleRow
            title={t("settings.daemon.quitOnExit.label")}
            description={t("settings.daemon.quitOnExit.description")}
            checked={quitOnExit}
            disabled={isLoadingQuitOnExit || isSavingQuitOnExit}
            onChange={(nextChecked) => {
              void onQuitOnExitChange(nextChecked);
            }}
          />
        </SettingsRows>
      </SettingsCard>
    </Box>
  );
}
