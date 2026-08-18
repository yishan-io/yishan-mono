import { Alert, Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiLogoGithub } from "react-icons/bi";
import { LuRefreshCw } from "react-icons/lu";
import {
  type CLIToolStatus,
  type ManagedCliToolId,
  installCliTool,
  listCLIToolStatuses,
  uninstallCliTool,
} from "../../../features/settings/commands/cliToolCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { MONOSPACE_SX } from "../../../helpers/styles";
import { useRefreshableLoader } from "../../../ui/hooks/useRefreshableLoader";
import { AgentCLISettingsCard } from "./AgentCLISettingsCard";
import { DaemonCliInstallCard } from "./DaemonCliInstallCard";
import { PiCliInstallCard } from "./PiCliInstallCard";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "./controls";

const CLI_STATUS_TIMEOUT_MS = 15_000;
const RECHECK_MIN_DURATION_MS = 500;

/** Renders the CLI settings view: supported CLIs (Yishan, Pi, GitHub) and agents. */
export function CLISettingsView() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CLIToolStatus>>({});
  const [installingToolId, setInstallingToolId] = useState<string | null>(null);
  const [uninstallingToolId, setUninstallingToolId] = useState<string | null>(null);
  const [toolErrorByToolId, setToolErrorByToolId] = useState<Record<string, string | undefined>>({});

  const fetchStatuses = useCallback((isManualRefresh: boolean) => listCLIToolStatuses(isManualRefresh), []);
  const {
    data: statusesData,
    isLoading,
    isRefreshing,
    hasLoadError,
    refresh,
  } = useRefreshableLoader({
    fetch: fetchStatuses,
    timeoutMs: CLI_STATUS_TIMEOUT_MS,
    minRefreshMs: RECHECK_MIN_DURATION_MS,
  });

  const statusByToolID = useMemo(() => {
    const nextMap = new Map<string, CLIToolStatus>();
    for (const status of statusesData ?? []) {
      nextMap.set(status.toolId, status);
    }
    for (const [toolId, status] of Object.entries(statusOverrides)) {
      nextMap.set(toolId, status);
    }
    return nextMap;
  }, [statusesData, statusOverrides]);

  // A fresh statuses list reflects the daemon's current state; drop install
  // overrides so they never shadow later rechecks (e.g. an external uninstall).
  useEffect(() => {
    if (statusesData) {
      setStatusOverrides({});
    }
  }, [statusesData]);

  const applyStatus = useCallback((toolId: string, status?: CLIToolStatus) => {
    if (status) {
      setStatusOverrides((prev) => ({ ...prev, [toolId]: status }));
    }
  }, []);

  const handleInstallTool = useCallback(
    async (toolId: ManagedCliToolId) => {
      setInstallingToolId(toolId);
      setToolErrorByToolId((prev) => ({ ...prev, [toolId]: undefined }));
      try {
        const status = await installCliTool(toolId);
        if (!isMountedRef.current) {
          return;
        }
        applyStatus(toolId, status);
      } catch (error) {
        console.error(`[CLISettingsView] Failed to install ${toolId}`, error);
        if (!isMountedRef.current) {
          return;
        }
        setToolErrorByToolId((prev) => ({ ...prev, [toolId]: getErrorMessage(error) }));
      } finally {
        if (isMountedRef.current) {
          setInstallingToolId(null);
        }
      }
    },
    [applyStatus],
  );

  const handleUninstallTool = useCallback(
    async (toolId: ManagedCliToolId) => {
      setUninstallingToolId(toolId);
      setToolErrorByToolId((prev) => ({ ...prev, [toolId]: undefined }));
      try {
        const status = await uninstallCliTool(toolId);
        if (!isMountedRef.current) {
          return;
        }
        applyStatus(toolId, status);
      } catch (error) {
        console.error(`[CLISettingsView] Failed to uninstall ${toolId}`, error);
        if (!isMountedRef.current) {
          return;
        }
        setToolErrorByToolId((prev) => ({ ...prev, [toolId]: getErrorMessage(error) }));
      } finally {
        if (isMountedRef.current) {
          setUninstallingToolId(null);
        }
      }
    },
    [applyStatus],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const githubStatus = statusByToolID.get("github");
  const isStatusPending = isLoading || isRefreshing;

  const githubStatusLabel = isStatusPending
    ? t("settings.cli.status.checking")
    : githubStatus?.installed
      ? githubStatus.authenticated
        ? githubStatus.account
          ? t("settings.cli.github.connectedAs", { username: githubStatus.account })
          : t("settings.cli.status.connected")
        : t("settings.cli.github.notLoggedIn")
      : t("settings.cli.github.notInstalled");

  const githubIsConnected = Boolean(githubStatus?.installed && githubStatus.authenticated);
  const githubStatusColor = isStatusPending ? "default" : githubIsConnected ? "success" : "default";
  const githubStatusVariant = isStatusPending ? "outlined" : githubIsConnected ? "filled" : "outlined";
  const githubVersionLabel = githubStatus?.installed && githubStatus.version ? `v${githubStatus.version}` : null;

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.cli.title")}
        description={t("settings.cli.description")}
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
            {t("settings.cli.actions.recheckAll")}
          </Button>
        }
      />
      <Box sx={{ mt: 3 }}>
        <PiCliInstallCard
          status={statusByToolID.get("pi") ?? null}
          isLoading={isLoading}
          isInstalling={installingToolId === "pi"}
          error={hasLoadError ? t("settings.cli.loadError") : (toolErrorByToolId.pi ?? null)}
          onInstall={() => {
            void handleInstallTool("pi");
          }}
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <DaemonCliInstallCard
          status={statusByToolID.get("yishan") ?? null}
          isLoading={isLoading}
          isInstalling={installingToolId === "yishan"}
          isUninstalling={uninstallingToolId === "yishan"}
          error={hasLoadError ? t("settings.cli.loadError") : (toolErrorByToolId.yishan ?? null)}
          onInstall={() => {
            void handleInstallTool("yishan");
          }}
          onUninstall={() => {
            void handleUninstallTool("yishan");
          }}
        />
      </Box>

      <Box sx={{ mt: 3 }}>
        <SettingsCard>
          {hasLoadError ? <Alert severity="error">{t("settings.cli.loadError")}</Alert> : null}
          <SettingsRows>
            <SettingsControlRow
              title={
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  <BiLogoGithub size={18} />
                  <Box component="span">{t("settings.cli.github.label")}</Box>
                </Box>
              }
              description={t("settings.cli.github.description")}
              control={
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    size="small"
                    label={githubStatusLabel}
                    color={githubStatusColor}
                    variant={githubStatusVariant}
                  />
                  {githubVersionLabel ? (
                    <Typography variant="body2" component="span" sx={MONOSPACE_SX}>
                      {githubVersionLabel}
                    </Typography>
                  ) : null}
                </Box>
              }
            />
          </SettingsRows>
        </SettingsCard>
      </Box>

      <Box sx={{ mt: 3 }}>
        <AgentCLISettingsCard
          statuses={statusesData ?? []}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          hasLoadError={hasLoadError}
        />
      </Box>
    </Box>
  );
}
