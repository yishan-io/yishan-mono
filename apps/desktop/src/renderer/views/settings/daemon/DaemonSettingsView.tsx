import { Alert, Box, Snackbar } from "@mui/material";
import { ConfirmationDialog } from "@renderer/components/ConfirmationDialog";
import { useDialogRegistration } from "@renderer/hooks/useDialogRegistration";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DaemonConnectionSection } from "./daemonSettings/DaemonConnectionSection";
import { DaemonControlsSection } from "./daemonSettings/DaemonControlsSection";
import { DaemonLogDialog } from "./daemonSettings/DaemonLogDialog";
import { DaemonRelaySection } from "./daemonSettings/DaemonRelaySection";
import { useDaemonConnectionState } from "./daemonSettings/useDaemonConnectionState";
import { useDaemonLogDialog } from "./daemonSettings/useDaemonLogDialog";
import { useQuitOnExitSetting } from "./daemonSettings/useQuitOnExitSetting";

/** Renders one settings panel for inspecting the local daemon connection. */
export function DaemonSettingsView() {
  const { t } = useTranslation();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const daemonState = useDaemonConnectionState();
  const quitOnExitState = useQuitOnExitSetting();
  const logDialogState = useDaemonLogDialog();

  useDialogRegistration(isConfirmOpen || logDialogState.isOpen);

  return (
    <Box>
      <DaemonConnectionSection
        daemonInfo={daemonState.daemonInfo}
        isLoading={daemonState.isLoading}
        isRefreshing={daemonState.isRefreshing}
        isRestarting={daemonState.isRestarting}
        hasLoadError={daemonState.hasLoadError}
        onRefresh={daemonState.refreshDaemonInfo}
      />

      <DaemonControlsSection
        restartError={daemonState.restartError}
        isRestarting={daemonState.isRestarting}
        isLoading={daemonState.isLoading}
        quitOnExit={quitOnExitState.quitOnExit}
        isLoadingQuitOnExit={quitOnExitState.isLoading}
        isSavingQuitOnExit={quitOnExitState.isSaving}
        onRestart={() => setIsConfirmOpen(true)}
        onOpenLog={logDialogState.open}
        onQuitOnExitChange={quitOnExitState.setQuitOnExit}
      />

      <DaemonRelaySection daemonInfo={daemonState.daemonInfo} isLoading={daemonState.isLoading} />

      <Snackbar
        open={daemonState.restartSuccessOpen}
        autoHideDuration={4000}
        onClose={() => daemonState.setRestartSuccessOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => daemonState.setRestartSuccessOpen(false)} variant="filled">
          {t("settings.daemon.restart.success")}
        </Alert>
      </Snackbar>

      <ConfirmationDialog
        open={isConfirmOpen}
        title={t("settings.daemon.restart.confirmTitle")}
        description={t("settings.daemon.restart.confirmMessage")}
        confirmLabel={t("settings.daemon.restart.action")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="warning"
        isSubmitting={daemonState.isRestarting}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          void daemonState.restartDaemon();
        }}
      />

      <DaemonLogDialog state={logDialogState} />
    </Box>
  );
}
