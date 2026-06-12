import { Alert, Box, Button, Chip, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiLogoGithub } from "react-icons/bi";
import { LuRefreshCw } from "react-icons/lu";
import { getDesktopCliInstallStatus, installDesktopCli, uninstallDesktopCli } from "../../commands/appCommands";
import type { GitHubConnectionStatus } from "../../commands/integrationCommands";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader";
import { DaemonCliInstallCard } from "./DaemonCliInstallCard";

const GITHUB_STATUS_TIMEOUT_MS = 15_000;
const RECHECK_MIN_DURATION_MS = 500;

/** Renders the Integrations settings view with connection status for external services. */
export function IntegrationSettingsView() {
  const { t } = useTranslation();
  const { checkGitHubConnectionStatus } = useCommands();
  const isMountedRef = useRef(true);
  const [isLoadingCliStatus, setIsLoadingCliStatus] = useState(true);
  const [isInstallingCli, setIsInstallingCli] = useState(false);
  const [isUninstallingCli, setIsUninstallingCli] = useState(false);
  const [cliInstallError, setCliInstallError] = useState<string | null>(null);
  const [cliStatus, setCliStatus] = useState<{
    isAvailableInPath: boolean;
    resolvedPath?: string;
    isManagedInstall: boolean;
    installPath: string;
    bundledCliPath: string;
  } | null>(null);

  const fetchStatus = useCallback(
    (isManualRefresh: boolean) => checkGitHubConnectionStatus(isManualRefresh),
    [checkGitHubConnectionStatus],
  );
  const {
    data: githubStatus,
    isLoading,
    isRefreshing,
    hasLoadError,
    refresh,
  } = useRefreshableLoader({
    fetch: fetchStatus,
    timeoutMs: GITHUB_STATUS_TIMEOUT_MS,
    minRefreshMs: RECHECK_MIN_DURATION_MS,
  });

  const isStatusPending = githubStatus === null && (isLoading || isRefreshing) && !hasLoadError;

  const githubStatusLabel = isStatusPending
    ? t("settings.integrations.status.checking")
    : githubStatus?.loggedIn
      ? githubStatus.username
        ? t("settings.integrations.github.connectedAs", { username: githubStatus.username })
        : t("settings.integrations.status.connected")
      : githubStatus?.installed
        ? t("settings.integrations.github.notLoggedIn")
        : t("settings.integrations.github.notInstalled");

  const githubStatusColor = isStatusPending ? "default" : githubStatus?.loggedIn ? "success" : "default";

  const githubStatusVariant = isStatusPending ? "outlined" : githubStatus?.loggedIn ? "filled" : "outlined";

  const loadCliInstallStatus = useCallback(async () => {
    setIsLoadingCliStatus(true);
    try {
      const status = await getDesktopCliInstallStatus();
      if (!isMountedRef.current) {
        return;
      }
      setCliStatus(status);
    } catch (error) {
      console.error("[IntegrationSettingsView] Failed to load CLI install status", error);
      if (!isMountedRef.current) {
        return;
      }
      setCliStatus(null);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCliStatus(false);
      }
    }
  }, []);

  const handleInstallCli = useCallback(async () => {
    setIsInstallingCli(true);
    setCliInstallError(null);
    try {
      const result = await installDesktopCli();
      if (!isMountedRef.current) {
        return;
      }
      if (result.success) {
        setCliStatus(result.status);
      } else {
        setCliInstallError(result.error);
        if (result.status) {
          setCliStatus(result.status);
        }
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      setCliInstallError(getErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsInstallingCli(false);
      }
    }
  }, []);

  const handleUninstallCli = useCallback(async () => {
    setIsUninstallingCli(true);
    setCliInstallError(null);
    try {
      const result = await uninstallDesktopCli();
      if (!isMountedRef.current) {
        return;
      }
      if (result.success) {
        setCliStatus(result.status);
      } else {
        setCliInstallError(result.error);
        if (result.status) {
          setCliStatus(result.status);
        }
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      setCliInstallError(getErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsUninstallingCli(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadCliInstallStatus();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadCliInstallStatus]);

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.integrations.title")}
        description={t("settings.integrations.description")}
        action={
          <Button
            size="small"
            variant="text"
            onClick={() => {
              refresh();
            }}
            disabled={isRefreshing}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : <LuRefreshCw />}
          >
            {t("settings.integrations.actions.recheckAll")}
          </Button>
        }
      />
      <SettingsCard>
        {hasLoadError ? <Alert severity="error">{t("settings.integrations.loadError")}</Alert> : null}
        <SettingsRows>
          <SettingsControlRow
            title={
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                <BiLogoGithub size={18} />
                <Box component="span">{t("settings.integrations.github.label")}</Box>
              </Box>
            }
            description={t("settings.integrations.github.description")}
            control={
              <Chip size="small" label={githubStatusLabel} color={githubStatusColor} variant={githubStatusVariant} />
            }
          />
        </SettingsRows>
      </SettingsCard>

      <Box sx={{ mt: 3 }}>
        <DaemonCliInstallCard
          status={cliStatus}
          isLoading={isLoadingCliStatus}
          isInstalling={isInstallingCli}
          isUninstalling={isUninstallingCli}
          error={cliInstallError}
          onInstall={() => {
            void handleInstallCli();
          }}
          onUninstall={() => {
            void handleUninstallCli();
          }}
        />
      </Box>
    </Box>
  );
}
