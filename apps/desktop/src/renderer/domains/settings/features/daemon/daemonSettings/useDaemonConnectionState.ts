import { subscribeDaemonInfoRefreshed } from "@renderer/domains/session";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DaemonInfoResult } from "../../../infrastructure/daemonHostCommands";
import { getDaemonInfo, restartDaemon as restartDaemonCommand } from "../../../infrastructure/daemonHostCommands";
import { closeTerminalTabsForDaemonRestart } from "./closeTerminalTabsForDaemonRestart";

/** Manages daemon info loading, refresh, restart, and live update subscription state. */
export function useDaemonConnectionState() {
  const { t } = useTranslation();
  const [daemonInfo, setDaemonInfo] = useState<DaemonInfoResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [restartSuccessOpen, setRestartSuccessOpen] = useState(false);
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
      const info = await getDaemonInfo();
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

  useEffect(() => {
    isMountedRef.current = true;
    void loadDaemonInfo(false);

    return () => {
      isMountedRef.current = false;
    };
  }, [loadDaemonInfo]);

  useEffect(() => {
    const unsubscribe = subscribeDaemonInfoRefreshed((info) => {
      if (!isMountedRef.current) {
        return;
      }
      setDaemonInfo(info);
      setHasLoadError(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const restartDaemon = useCallback(async () => {
    setIsRestarting(true);
    setRestartError(null);
    setDaemonInfo(null);
    latestLoadIdRef.current += 1;

    try {
      const closeErrors = await closeTerminalTabsForDaemonRestart();
      if (closeErrors.length > 0) {
        if (!isMountedRef.current) {
          return;
        }
        setRestartError(t("settings.daemon.restart.terminalCloseFailed"));
        setHasLoadError(true);
        setIsRestarting(false);
        return;
      }

      const result = await restartDaemonCommand();
      if (!isMountedRef.current) {
        return;
      }
      if (result.success) {
        setDaemonInfo(result.daemonInfo);
        setHasLoadError(false);
        setRestartSuccessOpen(true);
        return;
      }

      setRestartError(result.error);
      setHasLoadError(true);
    } catch (error) {
      console.error("[DaemonSettingsView] Failed to restart daemon", error);
      if (isMountedRef.current) {
        setRestartError(getErrorMessage(error) || t("settings.daemon.restart.failed"));
        setHasLoadError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setIsRestarting(false);
      }
    }
  }, [t]);

  return {
    daemonInfo,
    hasLoadError,
    isLoading,
    isRefreshing,
    isRestarting,
    refreshDaemonInfo: () => loadDaemonInfo(true),
    restartDaemon,
    restartError,
    restartSuccessOpen,
    setRestartSuccessOpen,
  };
}
