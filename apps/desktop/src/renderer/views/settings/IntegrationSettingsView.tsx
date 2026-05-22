import { Alert, Box, Button, Chip, CircularProgress } from "@mui/material";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BiLogoGithub } from "react-icons/bi";
import { LuRefreshCw } from "react-icons/lu";
import type { GitHubConnectionStatus } from "../../commands/integrationCommands";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { useCommands } from "../../hooks/useCommands";
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader";

const GITHUB_STATUS_TIMEOUT_MS = 15_000;
const RECHECK_MIN_DURATION_MS = 500;

/** Renders the Integrations settings view with connection status for external services. */
export function IntegrationSettingsView() {
  const { t } = useTranslation();
  const { checkGitHubConnectionStatus } = useCommands();

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
    </Box>
  );
}
