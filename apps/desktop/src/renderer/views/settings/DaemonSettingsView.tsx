import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPower, LuRefreshCw, LuX } from "react-icons/lu";
import type { DaemonInfoResult } from "../../../main/ipc";
import { closeTerminalSession } from "../../commands/terminalCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { StatusIndicator } from "../../components/StatusIndicator";
import {
  SettingsCard,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
  SettingsToggleRow,
} from "../../components/settings";
import { MONOSPACE_SX } from "../../helpers/styles";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";
import { getDesktopHostBridge, subscribeDesktopRpcEvent } from "../../rpc/rpcTransport";
import { tabStore } from "../../store/tabStore";

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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [quitOnExit, setQuitOnExit] = useState(false);
  const [isLoadingQuitOnExit, setIsLoadingQuitOnExit] = useState(true);
  const [isSavingQuitOnExit, setIsSavingQuitOnExit] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [visibleEntryCount, setVisibleEntryCount] = useState(100);
  useDialogRegistration(isConfirmOpen || isLogOpen);
  const latestLoadIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = useRef(0);

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

  useEffect(() => {
    const unsubscribe = subscribeDesktopRpcEvent((event) => {
      if (event.method !== "daemon.info.refreshed" || !event.payload || typeof event.payload !== "object") {
        return;
      }
      const payload = event.payload as Record<string, unknown>;
      if (typeof payload.daemonId !== "string" || typeof payload.version !== "string") {
        return;
      }
      if (!isMountedRef.current) {
        return;
      }
      setDaemonInfo(event.payload as DaemonInfoResult);
      setHasLoadError(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRestart = useCallback(async () => {
    setIsRestarting(true);
    setRestartError(null);
    setDaemonInfo(null);
    latestLoadIdRef.current += 1;

    try {
      const terminalTabs = tabStore.getState().tabs.filter((tab) => tab.kind === "terminal");
      if (terminalTabs.length > 0) {
        const sessionIds = [
          ...new Set(
            terminalTabs
              .map((tab) => (tab.kind === "terminal" ? tab.data.sessionId?.trim() : undefined))
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        const closeErrors: string[] = [];
        for (const sessionId of sessionIds) {
          try {
            await closeTerminalSession({ sessionId });
          } catch (error) {
            closeErrors.push(sessionId);
            console.warn("[DaemonSettingsView] Failed to close terminal session", sessionId, error);
          }
        }

        tabStore.getState().closeAllTerminalTabs();

        if (closeErrors.length > 0) {
          if (!isMountedRef.current) {
            return;
          }
          setRestartError(t("settings.daemon.restart.terminalCloseFailed"));
          setHasLoadError(true);
          setIsRestarting(false);
          return;
        }
      }

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

  const handleQuitOnExitChange = useCallback(async (nextChecked: boolean) => {
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
  }, []);

  const handleOpenLog = useCallback(async () => {
    setIsLogOpen(true);
    setIsLoadingLog(true);
    setLogContent(null);
    setLogError(null);
    setVisibleEntryCount(100);
    prevScrollHeightRef.current = 0;
    try {
      const result = await getDesktopHostBridge().readDaemonLog();
      if (!isMountedRef.current) {
        return;
      }
      if (result.ok) {
        setLogContent(result.content);
      } else {
        setLogError(result.error);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setLogError(error instanceof Error ? error.message : "Failed to read daemon log");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingLog(false);
      }
    }
  }, []);

  const handleCloseLog = useCallback(() => {
    setIsLogOpen(false);
    setLogContent(null);
    setLogError(null);
  }, []);

  const allLogEntries = useMemo(() => {
    if (!logContent) return [];
    return logContent
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return { _raw: line };
        }
      });
  }, [logContent]);

  const logEntries = useMemo(() => {
    return allLogEntries.slice(-visibleEntryCount);
  }, [allLogEntries, visibleEntryCount]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleEntryCount drives the expansion
  useLayoutEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;
    if (prevScrollHeightRef.current === 0) {
      container.scrollTop = container.scrollHeight;
      prevScrollHeightRef.current = container.scrollHeight;
      return;
    }
    // Subsequent loads: preserve the bottom-anchored position by
    // adjusting scrollTop by the growth in scrollHeight
    const newScrollHeight = container.scrollHeight;
    if (newScrollHeight > prevScrollHeightRef.current) {
      container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    }
    prevScrollHeightRef.current = newScrollHeight;
  }, [visibleEntryCount, logEntries.length]);

  const handleLogScroll = useCallback(() => {
    const container = logContainerRef.current;
    if (!container || container.scrollTop > 30) return;
    if (allLogEntries.length > visibleEntryCount) {
      prevScrollHeightRef.current = container.scrollHeight;
      setVisibleEntryCount((prev) => Math.min(prev + 100, allLogEntries.length));
    }
  }, [allLogEntries.length, visibleEntryCount]);

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
              void loadDaemonInfo(true);
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
                  onClick={() => {
                    setIsConfirmOpen(true);
                  }}
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
                    void handleOpenLog();
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
                void handleQuitOnExitChange(nextChecked);
              }}
            />
          </SettingsRows>
        </SettingsCard>
      </Box>

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
                control={
                  <StatusIndicator
                    label={
                      !daemonInfo?.relay?.enabled
                        ? t("settings.daemon.relay.status.disabled")
                        : daemonInfo.relay.connected
                          ? t("settings.daemon.relay.status.connected")
                          : t("settings.daemon.relay.status.disconnected")
                    }
                    color={!daemonInfo?.relay?.enabled ? "disabled" : daemonInfo.relay.connected ? "success" : "error"}
                  />
                }
              />
              <SettingsControlRow
                title={t("settings.daemon.relay.rows.url")}
                control={
                  <Typography variant="body2" sx={MONOSPACE_SX}>
                    {daemonInfo?.relay?.url || t("settings.daemon.values.unknown")}
                  </Typography>
                }
              />
              {daemonInfo?.relay?.connectedAt ? (
                <SettingsControlRow
                  title={t("settings.daemon.relay.rows.connectedAt")}
                  control={
                    <Typography variant="body2">{new Date(daemonInfo.relay.connectedAt).toLocaleString()}</Typography>
                  }
                />
              ) : null}
              {daemonInfo?.relay?.lastError ? (
                <SettingsControlRow
                  title={t("settings.daemon.relay.rows.lastError")}
                  control={
                    <Typography variant="body2" color="error">
                      {daemonInfo.relay.lastError}
                    </Typography>
                  }
                />
              ) : null}
            </SettingsRows>
          )}
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

      <ConfirmationDialog
        open={isConfirmOpen}
        title={t("settings.daemon.restart.confirmTitle")}
        description={t("settings.daemon.restart.confirmMessage")}
        confirmLabel={t("settings.daemon.restart.action")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="warning"
        isSubmitting={isRestarting}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          void handleRestart();
        }}
      />

      <Dialog open={isLogOpen} onClose={handleCloseLog} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {t("settings.daemon.log.title")}
          <IconButton size="small" onClick={handleCloseLog}>
            <LuX />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {isLoadingLog ? (
            <CenteredSpinner />
          ) : logError ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{logError}</Alert>
            </Box>
          ) : (
            <Box ref={logContainerRef} sx={{ maxHeight: "60vh", overflow: "auto", p: 1 }} onScroll={handleLogScroll}>
              {logEntries.map((entry, index) => {
                const level = typeof entry.level === "string" ? entry.level : undefined;
                const time = typeof entry.time === "string" ? entry.time : undefined;
                const message =
                  typeof entry.message === "string"
                    ? entry.message
                    : entry._raw
                      ? String(entry._raw)
                      : JSON.stringify(entry);

                const metadata = Object.entries(entry)
                  .filter(([key]) => key !== "level" && key !== "time" && key !== "message" && key !== "_raw")
                  .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
                  .join("  ");

                const levelColor =
                  level === "error" || level === "fatal"
                    ? "error"
                    : level === "warn"
                      ? "warning"
                      : level === "debug" || level === "trace"
                        ? "default"
                        : "info";

                const formattedTime = time ? new Date(time).toLocaleString() : undefined;

                const entryKey = `${index}-${time ?? ""}-${level ?? ""}-${message.slice(0, 40)}`;

                return (
                  <Box
                    key={entryKey}
                    sx={{
                      display: "flex",
                      gap: 1,
                      py: 0.25,
                      px: 1,
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      alignItems: "flex-start",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    {formattedTime ? (
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                          color: "text.secondary",
                          flexShrink: 0,
                          minWidth: 140,
                          pt: "2px",
                        }}
                      >
                        {formattedTime}
                      </Typography>
                    ) : null}
                    {level ? (
                      <Chip
                        label={level.toUpperCase()}
                        size="small"
                        color={levelColor as "error" | "warning" | "default" | "info"}
                        sx={{ height: 20, fontSize: "0.65rem", flexShrink: 0, mt: "1px" }}
                      />
                    ) : null}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          lineHeight: 1.4,
                        }}
                      >
                        {message}
                      </Typography>
                      {metadata ? (
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.7rem",
                            color: "text.disabled",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            display: "block",
                          }}
                        >
                          {metadata}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
