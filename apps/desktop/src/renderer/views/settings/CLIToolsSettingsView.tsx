import { Alert, Box, Button, Chip, CircularProgress, Stack, Switch } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CLIToolStatus } from "../../commands/cliToolCommands";
import { AgentIcon } from "../../components/AgentIcon";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
} from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";

const CLI_TOOLS_STATUS_TIMEOUT_MS = 15_000;
const CLI_TOOLS_RECHECK_MIN_DURATION_MS = 500;

export function CLIToolsSettingsView() {
  const { t } = useTranslation();
  const { listCLIToolStatuses } = useCommands();
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const setAgentInUse = agentSettingsStore((state) => state.setAgentInUse);

  const fetchStatuses = useCallback(
    (isManualRefresh: boolean) => listCLIToolStatuses(isManualRefresh),
    [listCLIToolStatuses],
  );
  const {
    data: statusesData,
    isLoading,
    isRefreshing,
    hasLoadError,
    refresh,
  } = useRefreshableLoader({
    fetch: fetchStatuses,
    timeoutMs: CLI_TOOLS_STATUS_TIMEOUT_MS,
    minRefreshMs: CLI_TOOLS_RECHECK_MIN_DURATION_MS,
  });
  const statuses: CLIToolStatus[] = statusesData ?? [];

  const statusByToolID = useMemo(() => {
    const nextMap = new Map<string, CLIToolStatus>();
    for (const status of statuses) {
      nextMap.set(status.toolId, status);
    }
    return nextMap;
  }, [statuses]);

  const isStatusPending = isLoading || isRefreshing;

  return (
    <Box data-testid="agent-settings-panel">
      <SettingsSectionHeader
        title={t("settings.agents.title")}
        description={t("settings.agents.description")}
        action={
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              refresh();
            }}
            disabled={isRefreshing}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : null}
          >
            {t("settings.agents.actions.rescanAll")}
          </Button>
        }
      />

      <Stack spacing={2}>
        <SettingsCard>
          {hasLoadError ? <Alert severity="error">{t("settings.agents.loadError")}</Alert> : null}
          <SettingsRows>
            {SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => {
              const status = statusByToolID.get(agentKind);
              const detected = status?.installed;
              const version = status?.version;
              const isPending = isStatusPending && !status;
              const label = isPending
                ? t("settings.agents.status.checking")
                : detected
                  ? version
                    ? `${t("settings.agents.status.versionPrefix")} ${version}`
                    : t("settings.agents.status.versionUnknown")
                  : t("settings.agents.status.notDetected");

              return (
                <SettingsControlRow
                  key={agentKind}
                  title={
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <AgentIcon agentKind={agentKind as DesktopAgentKind} context="settingsRow" decorative />
                      <Box component="span">{t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])}</Box>
                    </Box>
                  }
                  control={
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                      <Chip
                        size="small"
                        label={label}
                        color={detected ? "success" : "default"}
                        variant={detected ? "filled" : "outlined"}
                      />
                      <Switch
                        checked={inUseByAgentKind[agentKind as DesktopAgentKind]}
                        onChange={(event) => {
                          if (!isDesktopAgentKind(agentKind)) {
                            return;
                          }
                          setAgentInUse(agentKind, event.target.checked);
                        }}
                        slotProps={{
                          input: {
                            "aria-label": `${t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])} ${t("settings.agents.inUse")}`,
                          },
                        }}
                      />
                    </Stack>
                  }
                />
              );
            })}
          </SettingsRows>
        </SettingsCard>
      </Stack>
    </Box>
  );
}
