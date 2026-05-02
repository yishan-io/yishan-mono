import { Alert, Box, Button, Chip, CircularProgress, Snackbar, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DaemonInfoResult } from "../../../main/ipc";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader, SettingsToggleRow } from "../../components/settings";
import { getDesktopHostBridge } from "../../rpc/rpcTransport";

/** Renders one settings panel for inspecting the local daemon connection. */
export function DaemonSettingsView() {
  const { t } = useTranslation();
  const [daemonInfo, setDaemonInfo] = useState<DaemonInfoResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [restartSuccessOpen, setRestartSuccessOpen] = useState(false);
  const [quitOnExit, setQuitOnExit] = useState(false);
  const [isLoadingQuitOnExit, setIsLoadingQuitOnExit] = useState(true);
  const [isSavingQuitOnExit, setIsSavingQuitOnExit] = useState(false);
  const latestLoadIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const loadDaemonInfo = useCallback(async (isManualRefresh: boolean) => {
    const loadId = latestLoadIdRef.current + 1;
    latestLoadIdRef.current = loadId;
    const isLatestMountedLoad = () => isMountedRef.current && latestLoadIdRef.current === loadId;

    if (isManualRefresh) {
      setIsRefreshing(true);
    }
    setHasLoadError(false);

    try {
      const info = await getDesktopHostBridge().getDaemonInfo();
      if (!isLatestMountedLoad()) {
        return;
      }
      setDaemonInfo(info);
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to load daemon info", error);
      if (!isLatestMountedLoad()) {
        return;
      }
      setDaemonInfo(null);
      setHasLoadError(true);
    } finally {
      if (isLatestMountedLoad()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  const loadQuitOnExit = useCallback(async () => {
    try {
      const value = await getDesktopHostBridge().getDaemonQuitOnExit();
      if (!isMountedRef.current) {
        return;
      }
      setQuitOnExit(value);
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to load quit-on-exit setting", error);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingQuitOnExit(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDaemonInfo(false);
    void loadQuitOnExit();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadDaemonInfo, loadQuitOnExit]);

  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    setRestartError(null);
    setDaemonInfo(null);
    // Invalidate any in-flight load so stale data cannot overwrite post-restart state.
    latestLoadIdRef.current += 1;

    try {
      const result = await getDesktopHostBridge().restartDaemon();
      if (!isMountedRef.current) {
        return;
      }
      if (result.success) {
        setDaemonInfo(result.daemonInfo);
        setHasLoadError(false);
        setRestartSuccessOpen(true);
      } else {
        setRestartError(result.error);
        setHasLoadError(true);
      }
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to restart daemon", error);
      if (isMountedRef.current) {
        setRestartError(error instanceof Error ? error.message : t("settings.daemon.restart.failed"));
        setHasLoadError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setIsRestarting(false);
      }
    }
  }, [t]);

  const handleQuitOnExitChange = useCallback(
    async (nextChecked: boolean) => {
      setQuitOnExit(nextChecked);
      setIsSavingQuitOnExit(true);
      try {
        await getDesktopHostBridge().setDaemonQuitOnExit(nextChecked);
      } catch (error) {
        console.error("[DaemonSettingsView] Failed to save quit-on-exit setting", error);
        if (isMountedRef.current) {
          setQuitOnExit(!nextChecked);
        }
      } finally {
        if (isMountedRef.current) {
          setIsSavingQuitOnExit(false);
        }
      }
    },
    [],
  );

  const statusLabel = daemonInfo ? t("settings.daemon.status.running") : t("settings.daemon.status.unavailable");

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.daemon.title")}
        description={t("settings.daemon.description")}
        action={
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              void loadDaemonInfo(true);
            }}
            disabled={isRefreshing || isLoading || isRestarting}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : null}
          >
            {t("settings.daemon.actions.refresh")}
          </Button>
        }
      />
      <SettingsCard>
        {isLoading ? (
          <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.daemon.loadError")}</Alert> : null}
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.daemon.rows.status")}
                control={
                  <Chip
                    size="small"
                    label={statusLabel}
                    color={daemonInfo ? "success" : "default"}
                    variant={daemonInfo ? "filled" : "outlined"}
                  />
                }
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
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {daemonInfo?.daemonId || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
              <SettingsControlRow
                title={t("settings.daemon.rows.websocket")}
                control={
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {daemonInfo?.wsUrl || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
            </SettingsRows>
          </>
        )}
      </SettingsCard>

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
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    void handleRestart();
                  }}
                  disabled={isRestarting || isLoading}
                  startIcon={isRestarting ? <CircularProgress size={14} color="inherit" /> : null}
                >
                  {isRestarting ? t("settings.daemon.restart.inProgress") : t("settings.daemon.restart.action")}
                </Button>
              }
            />
            <SettingsToggleRow
              title={t("settings.daemon.quitOnExit.label")}
              description={t("settings.daemon.quitOnExit.description")}
              checked={quitOnExit}
              disabled={isLoadingQuitOnExit || isSavingQuitOnExit}
              onChange={(nextChecked) => {
                void handleQuitOnExitChange(nextChecked);
              }}
            />
          </SettingsRows>
        </SettingsCard>
      </Box>

      <Snackbar
        open={restartSuccessOpen}
        autoHideDuration={4000}
        onClose={() => setRestartSuccessOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setRestartSuccessOpen(false)} variant="filled">
          {t("settings.daemon.restart.success")}
        </Alert>
      </Snackbar>
    </Box>
  );
}
